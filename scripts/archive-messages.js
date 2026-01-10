#!/usr/bin/env node

/**
 * Archive Messages Script for Telegram Bot to Hugo Blog
 *
 * This script archives old published messages to keep data files manageable.
 * It's designed to be run periodically by GitHub Actions.
 */

const fs = require('fs-extra');
const path = require('path');

// Configuration
const DATA_DIR = path.join(__dirname, '..', 'data');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');

// File paths
const PUBLISHED_MESSAGES_FILE = path.join(DATA_DIR, 'published-messages.json');
const REJECTED_MESSAGES_FILE = path.join(DATA_DIR, 'rejected-messages.json');

// Archive settings
const ARCHIVE_AFTER_DAYS = 30; // Archive messages older than 30 days
const MAX_PUBLISHED_MESSAGES = 100; // Keep max 100 messages in published file

/**
 * Main archiving function
 */
async function main() {
    try {
        console.log('🗃️ Starting message archiving...');

        // Ensure archive directory exists
        await fs.ensureDir(ARCHIVE_DIR);

        // Archive published messages
        await archivePublishedMessages();

        // Archive rejected messages
        await archiveRejectedMessages();

        console.log('✅ Message archiving completed');

    } catch (error) {
        console.error('💥 Archiving failed:', error);
        process.exit(1);
    }
}

/**
 * Archive old published messages
 */
async function archivePublishedMessages() {
    const publishedData = await loadMessages(PUBLISHED_MESSAGES_FILE);

    if (publishedData.messages.length <= MAX_PUBLISHED_MESSAGES) {
        console.log(`📊 Published messages (${publishedData.messages.length}) within limit, no archiving needed`);
        return;
    }

    // Sort messages by publication date (newest first)
    const sortedMessages = publishedData.messages.sort((a, b) =>
        new Date(b.published_at) - new Date(a.published_at)
    );

    // Keep the most recent messages
    const recentMessages = sortedMessages.slice(0, MAX_PUBLISHED_MESSAGES);
    const messagesToArchive = sortedMessages.slice(MAX_PUBLISHED_MESSAGES);

    if (messagesToArchive.length === 0) {
        console.log('📊 No published messages to archive');
        return;
    }

    // Create archive file for this batch
    const archiveDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const archiveFilename = `published-messages-${archiveDate}.json`;
    const archiveFilePath = path.join(ARCHIVE_DIR, archiveFilename);

    // Load existing archive file or create new
    const existingArchive = await loadMessages(archiveFilePath);
    const archivedMessages = [...existingArchive.messages, ...messagesToArchive];

    // Save archive file
    const archiveData = {
        messages: archivedMessages,
        archived_at: new Date().toISOString(),
        original_count: publishedData.messages.length,
        archived_count: messagesToArchive.length,
        version: "1.0"
    };

    await fs.writeFile(archiveFilePath, JSON.stringify(archiveData, null, 2), 'utf8');

    // Update published messages file with only recent messages
    const updatedPublishedData = {
        ...publishedData,
        messages: recentMessages,
        lastUpdated: new Date().toISOString(),
        last_archived: archiveDate,
        archived_count: messagesToArchive.length
    };

    await fs.writeFile(
        PUBLISHED_MESSAGES_FILE,
        JSON.stringify(updatedPublishedData, null, 2),
        'utf8'
    );

    console.log(`📦 Archived ${messagesToArchive.length} published messages to ${archiveFilename}`);
}

/**
 * Archive old rejected messages
 */
async function archiveRejectedMessages() {
    const rejectedData = await loadMessages(REJECTED_MESSAGES_FILE);

    if (rejectedData.messages.length === 0) {
        console.log('📊 No rejected messages to archive');
        return;
    }

    // Find messages older than ARCHIVE_AFTER_DAYS
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_AFTER_DAYS);

    const oldMessages = rejectedData.messages.filter(msg =>
        new Date(msg.rejected_at || msg.created_at) < cutoffDate
    );

    const recentMessages = rejectedData.messages.filter(msg =>
        new Date(msg.rejected_at || msg.created_at) >= cutoffDate
    );

    if (oldMessages.length === 0) {
        console.log('📊 No old rejected messages to archive');
        return;
    }

    // Create archive file for rejected messages
    const archiveDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const archiveFilename = `rejected-messages-${archiveDate}.json`;
    const archiveFilePath = path.join(ARCHIVE_DIR, archiveFilename);

    // Load existing archive file or create new
    const existingArchive = await loadMessages(archiveFilePath);
    const archivedMessages = [...existingArchive.messages, ...oldMessages];

    // Save archive file
    const archiveData = {
        messages: archivedMessages,
        archived_at: new Date().toISOString(),
        cutoff_date: cutoffDate.toISOString(),
        original_count: rejectedData.messages.length,
        archived_count: oldMessages.length,
        version: "1.0"
    };

    await fs.writeFile(archiveFilePath, JSON.stringify(archiveData, null, 2), 'utf8');

    // Update rejected messages file with only recent messages
    const updatedRejectedData = {
        ...rejectedData,
        messages: recentMessages,
        lastUpdated: new Date().toISOString(),
        last_archived: archiveDate,
        archived_count: oldMessages.length
    };

    await fs.writeFile(
        REJECTED_MESSAGES_FILE,
        JSON.stringify(updatedRejectedData, null, 2),
        'utf8'
    );

    console.log(`📦 Archived ${oldMessages.length} rejected messages to ${archiveFilename}`);
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
 * Get archive statistics
 */
async function getArchiveStats() {
    try {
        const archiveFiles = await fs.readdir(ARCHIVE_DIR);
        const stats = {
            totalArchiveFiles: 0,
            totalArchivedMessages: 0,
            publishedArchives: 0,
            rejectedArchives: 0
        };

        for (const filename of archiveFiles) {
            if (filename.endsWith('.json')) {
                const filePath = path.join(ARCHIVE_DIR, filename);
                const data = await loadMessages(filePath);

                stats.totalArchiveFiles++;
                stats.totalArchivedMessages += data.messages.length;

                if (filename.startsWith('published-')) {
                    stats.publishedArchives++;
                } else if (filename.startsWith('rejected-')) {
                    stats.rejectedArchives++;
                }
            }
        }

        return stats;
    } catch (error) {
        console.warn('Could not get archive stats:', error.message);
        return null;
    }
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
    archivePublishedMessages,
    archiveRejectedMessages,
    getArchiveStats
};