#!/usr/bin/env node

/**
 * Content Generation Script for Telegram Bot to Hugo Blog
 *
 * This script processes approved messages and converts them to Hugo markdown posts.
 * It's designed to be run by GitHub Actions after message approval.
 */

const fs = require('fs-extra');
const path = require('path');
const slugify = require('slugify');
const YAML = require('yaml');
const project_name = process.env.project_name || 'tblog';

// Configuration
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONTENT_DIR = path.join(__dirname, '..', 'content', 'posts');
const STATIC_IMAGES_DIR = path.join(__dirname, '..', 'static', 'images');

// File paths
const APPROVED_MESSAGES_FILE = path.join(DATA_DIR, 'approved-messages.json');
const PUBLISHED_MESSAGES_FILE = path.join(DATA_DIR, 'published-messages.json');

/**
 * Main function to process approved messages
 */
async function main() {
    try {
        console.log('🚀 Starting content generation...');

        // Load approved messages
        const approvedData = await loadMessages(APPROVED_MESSAGES_FILE);
        const publishedData = await loadMessages(PUBLISHED_MESSAGES_FILE);

        if (approvedData.messages.length === 0) {
            console.log('📭 No approved messages to process');
            return;
        }

        console.log(`📝 Processing ${approvedData.messages.length} approved messages...`);

        // Ensure content directory exists
        await fs.ensureDir(CONTENT_DIR);

        const processedMessages = [];

        // Process each approved message
        for (const message of approvedData.messages) {
            try {
                console.log(`Processing message: ${message.id}`);

                // Generate Hugo post
                await generateHugoPost(message);

                // Mark as published
                message.status = 'published';
                message.published_at = new Date().toISOString();

                processedMessages.push(message);

                console.log(`✅ Generated post for message: ${message.id}`);

            } catch (error) {
                console.error(`❌ Failed to process message ${message.id}:`, error.message);
                // Continue processing other messages
            }
        }

        if (processedMessages.length > 0) {
            // Update data files
            await updateMessageFiles(processedMessages, approvedData, publishedData);

            console.log(`🎉 Successfully processed ${processedMessages.length} messages`);
        } else {
            console.log('⚠️ No messages were successfully processed');
        }

    } catch (error) {
        console.error('💥 Content generation failed:', error);
        process.exit(1);
    }
}

/**
 * Load messages from JSON file
 */
async function loadMessages(filePath) {
    try {
        if (await fs.pathExists(filePath)) {
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object' && 'messages' in parsed) {
                return parsed;
            }
        }
    } catch (error) {
        console.warn(`Could not load ${filePath}:`, error.message);
    }

    // Return default structure
    return {
        messages: [],
        lastUpdated: new Date().toISOString(),
        version: "1.0"
    };
}

/**
 * Generate Hugo markdown post from message
 */
async function generateHugoPost(message) {
    // Create slug from message content or timestamp
    const slug = generateSlug(message);

    // Create filename based on date and slug
    const date = new Date(message.timestamp);
    const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `${dateString}-${slug}.md`;
    const filePath = path.join(CONTENT_DIR, filename);

    // Generate front matter
    const frontMatter = {
        title: generateTitle(message),
        date: message.timestamp,
        draft: false,
        tags: message.tags || [],
        telegram_id: message.telegram_message_id,
        message_id: message.id
    };

    // Add images to front matter if present
    if (message.images && message.images.length > 0) {
        frontMatter.images = message.images.map(img =>
            img.path.replace('/static/', '/') // Convert to Hugo static path
        );
    }

    // Generate content
    let content = message.content;

    // Add images to content if present
    if (message.images && message.images.length > 0) {
        content += '\n\n';

        for (const image of message.images) {
            const imagePath = image.path.replace('/images/', '/' + project_name + '/images/'); // Convert to Hugo static path
            const altText = image.caption || `Image from ${message.id}`;

            content += `![${altText}](${imagePath})\n`;

            if (image.caption) {
                content += `*${image.caption}*\n`;
            }
            content += '\n';
        }
    }

    // Add metadata footer
    content += `\n---\n`;
    content += `*This post was automatically generated from Telegram message ${message.telegram_message_id} on ${formatDate(message.timestamp)}.*\n`;

    // Create full markdown content
    const yamlFrontMatter = YAML.stringify(frontMatter);
    const fullContent = `---\n${yamlFrontMatter}---\n\n${content}`;

    // Write file
    await fs.writeFile(filePath, fullContent, 'utf8');

    console.log(`📄 Created post: ${filename}`);
}

/**
 * Generate URL-friendly slug from message
 */
function generateSlug(message) {
    // Try to create slug from first few words of content
    const words = message.content
        .split(' ')
        .slice(0, 6) // Take first 6 words
        .join(' ')
        .toLowerCase();

    return slugify(words, {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g
    }).substring(0, 50); // Limit length
}

/**
 * Generate post title from message
 */
function generateTitle(message) {
    // Use first sentence or first 50 characters as title
    const firstSentence = message.content.split(/[.!?]/)[0].trim();

    if (firstSentence.length > 0 && firstSentence.length <= 60) {
        return firstSentence;
    }

    // Fallback to first 50 characters
    const title = message.content.substring(0, 50).trim();
    return title.endsWith('...') ? title : title + '...';
}

/**
 * Update message data files after processing
 */
async function updateMessageFiles(processedMessages, approvedData, publishedData) {
    // Remove processed messages from approved
    const remainingApproved = approvedData.messages.filter(
        msg => !processedMessages.some(processed => processed.id === msg.id)
    );

    // Add processed messages to published
    const newPublished = [...publishedData.messages, ...processedMessages];

    // Update approved messages file
    const updatedApprovedData = {
        ...approvedData,
        messages: remainingApproved,
        lastUpdated: new Date().toISOString()
    };

    // Update published messages file
    const updatedPublishedData = {
        ...publishedData,
        messages: newPublished,
        lastUpdated: new Date().toISOString()
    };

    // Write files
    await fs.writeFile(
        APPROVED_MESSAGES_FILE,
        JSON.stringify(updatedApprovedData, null, 2),
        'utf8'
    );

    await fs.writeFile(
        PUBLISHED_MESSAGES_FILE,
        JSON.stringify(updatedPublishedData, null, 2),
        'utf8'
    );

    console.log('📊 Updated message data files');
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Run the main function if this script is executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });
}

module.exports = {
    main,
    generateHugoPost,
    loadMessages
};