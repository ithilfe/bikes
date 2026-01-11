# Setting Up Admin Accounts

This document explains how to configure admin accounts for your blog, including GitHub Secrets and Google (Gmail) login support.

## Key Changes

1. **GitHub Secrets for Configuration**: Modified the deployment workflow (.github/workflows/hugo.yml) to inject a secret named `ADMIN_CONFIG` into the site during the build process. This keeps your user list and credentials out of the source code.

2. **Google Login Support**: Added "Sign in with Google" to the admin panel. You can now authorize specific Gmail accounts to manage the blog.

3. **Secure Build-Time Injection**: Credentials are no longer saved in `data/users.json` on the server. Instead, they are provided to the frontend via a `config.json` file generated only during deployment.

## Configuring Login

### Setting Up ADMIN_CONFIG Secret

You need to add a secret to your GitHub repository:

1. Go to **Settings > Secrets and variables > Actions**
2. Create a new repository secret named `ADMIN_CONFIG`
3. Set the value to a JSON string like this:

```json
{
  "google_client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  "allowed_emails": ["your-email@gmail.com", "other-admin@gmail.com"],
  "users": [
    {
      "username": "admin",
      "password_hash": "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
    }
  ]
}
```

*(The password_hash above is for the password "admin". You can use any SHA-256 generator to create hashes for other passwords.)*

## Getting a Google Client ID

If you want to use Gmail login:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and go to **APIs & Services > Credentials**
3. Create an OAuth 2.0 Client ID for a "Web application"
4. Add your blog's URL (e.g., `https://username.github.io`) to **Authorized JavaScript origins**
5. Copy the Client ID into your `ADMIN_CONFIG` secret

## Note on Writing to the Blog

Since administrators might not have their own GitHub accounts, the application will prompt the user for a GitHub Personal Access Token (PAT) the first time they try to approve or reject a message. You (the blog owner) can provide them with a token that has repo permissions, which they can then "login" with once and it will be saved in their browser's local storage.

## Step-by-Step Guide to Getting a Google Client ID

### 1. Create a Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown in the top left and select **New Project**
3. Give it a name (e.g., "Telegram Blog Admin") and click **Create**

### 2. Configure OAuth Consent Screen

Before creating the ID, you must tell Google about your "App":

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** and click **Create**
3. Fill in the required fields:
   - **App name**: Telegram Blog Admin
   - **User support email**: Your email
   - **Developer contact info**: Your email
4. Click **Save and Continue** through the "Scopes" and "Test Users" sections (you don't need to change anything there for a simple login)
5. On the summary page, click **Back to Dashboard**
6. **Important**: Click **Publish App** under the "Testing" status so it works for anyone in your `allowed_emails` list

### 3. Create the Client ID

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials** at the top and select **OAuth client ID**
3. Select **Web application** as the Application type
4. **Authorized JavaScript origins**:
   - Add your blog's URL: `https://your-username.github.io`
   - (Optional) If you test locally: `http://localhost:1313`
5. Click **Create**
6. A popup will appear with **Your Client ID**. It looks like a long string ending in `.apps.googleusercontent.com`

### 4. Update Your GitHub Secret

Copy that Client ID and paste it into your `ADMIN_CONFIG` secret in GitHub:

```json
{
  "google_client_id": "PASTE_YOUR_ID_HERE.apps.googleusercontent.com",
  "allowed_emails": ["your-email@gmail.com"],
  "github_token": "ghp_your_personal_access_token_here"
}
```

### Using GH_PAT or PERSONAL_ACCESS_TOKEN Secret (Alternative)

Alternatively, you can create a separate secret named `GH_PAT` or `PERSONAL_ACCESS_TOKEN` in your GitHub repository. The build process will automatically detect these secrets and include the token in the admin configuration. This is useful if you want to keep the token separate from the other admin settings.

1. Go to **Settings > Secrets and variables > Actions**
2. Create a new repository secret named `GH_PAT` (or `PERSONAL_ACCESS_TOKEN`)
3. Paste your GitHub Personal Access Token as the value

The application will prioritize any token found in your browser's local storage, then fallback to the token provided via these secrets.

