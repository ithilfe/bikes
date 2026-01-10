#!/usr/bin/env python3
"""
Telegram Bot Update Fetcher

This script fetches updates from Telegram Bot API using long polling
and processes messages into the pending queue for approval.
Runs daily via GitHub Actions.
"""

import json
import os
import sys
import base64
from datetime import datetime
from typing import Dict, List, Optional
import urllib.request
import urllib.error
import urllib.parse


class TelegramFetcher:
    """Handles fetching and processing Telegram bot updates."""

    def __init__(self):
        """Initialize with environment variables."""
        self.bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
        self.github_token = os.environ.get("GITHUB_TOKEN")
        self.github_owner = os.environ.get("GITHUB_OWNER")
        self.github_repo = os.environ.get("GITHUB_REPO")

        if not all(
            [self.bot_token, self.github_token, self.github_owner, self.github_repo]
        ):
            raise ValueError("Missing required environment variables")

        self.telegram_api_base = f"https://api.telegram.org/bot{self.bot_token}"
        self.github_api_base = "https://api.github.com"

        # Track last processed update ID
        self.last_update_id = self._load_last_update_id()

    def _load_last_update_id(self) -> int:
        """Load the last processed update ID from GitHub."""
        try:
            data = self._github_get_file("data/last-update-id.json")
            if data:
                content = json.loads(data)
                return content.get("last_update_id", 0)
        except Exception as e:
            print(f"Could not load last update ID: {e}")
        return 0

    def _save_last_update_id(self, update_id: int):
        """Save the last processed update ID to GitHub."""
        try:
            content = json.dumps(
                {
                    "last_update_id": update_id,
                    "updated_at": datetime.utcnow().isoformat(),
                },
                indent=2,
            )

            self._github_create_or_update_file(
                "data/last-update-id.json",
                content,
                f"Update last processed update ID to {update_id}",
            )
        except Exception as e:
            print(f"Error saving last update ID: {e}")

    def _make_request(
        self, url: str, data: Optional[Dict] = None, headers: Optional[Dict] = None
    ) -> Dict:
        """Make an HTTP request and return JSON response."""
        if headers is None:
            headers = {}

        if data is not None:
            data = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(url, data=data, headers=headers)

        try:
            with urllib.request.urlopen(request) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            print(f"HTTP Error {e.code}: {error_body}")
            raise
        except urllib.error.URLError as e:
            print(f"URL Error: {e.reason}")
            raise

    def _telegram_request(self, method: str, params: Optional[Dict] = None) -> Dict:
        """Make a request to Telegram Bot API."""
        url = f"{self.telegram_api_base}/{method}"
        if params:
            url += "?" + urllib.parse.urlencode(params)

        response = self._make_request(url)

        if not isinstance(response, dict) or not response.get("ok"):
            raise Exception(f"Telegram API error: {response.get('description') if isinstance(response, dict) else 'Unknown error'}")

        return response.get("result")

    def _github_request(
        self, method: str, endpoint: str, data: Optional[Dict] = None
    ) -> Dict:
        """Make a request to GitHub API."""
        url = f"{self.github_api_base}{endpoint}"
        headers = {
            "Authorization": f"token {self.github_token}",
            "Accept": "application/vnd.github.v3+json",
        }

        request = urllib.request.Request(url, headers=headers, method=method)

        if data is not None:
            request.data = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"

        try:
            with urllib.request.urlopen(request) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            error_body = e.read().decode("utf-8")
            print(f"GitHub API Error {e.code}: {error_body}")
            raise

    def _github_get_file(self, path: str) -> Optional[str]:
        """Get file content from GitHub repository."""
        try:
            response = self._github_request(
                "GET", f"/repos/{self.github_owner}/{self.github_repo}/contents/{path}"
            )
            if isinstance(response, dict) and "content" in response:
                return base64.b64decode(response["content"]).decode("utf-8")
        except Exception as e:
            print(f"Error getting file {path}: {e}")
        return None

    def _github_create_or_update_file(self, path: str, content: str, message: str):
        """Create or update a file in GitHub repository."""
        # Get current file SHA if it exists
        sha = None
        try:
            response = self._github_request(
                "GET", f"/repos/{self.github_owner}/{self.github_repo}/contents/{path}"
            )
            if response:
                sha = response.get("sha")
        except Exception:
            pass  # File doesn't exist, will create new

        # Prepare file content
        content_base64 = base64.b64encode(content.encode("utf-8")).decode("utf-8")

        data = {
            "message": message,
            "content": content_base64,
            "committer": {"name": "Telegram Bot", "email": "bot@telegram.org"},
        }

        if sha:
            data["sha"] = sha

        self._github_request(
            "PUT",
            f"/repos/{self.github_owner}/{self.github_repo}/contents/{path}",
            data,
        )

    def fetch_updates(self) -> List[Dict]:
        """Fetch new updates from Telegram."""
        print(f"Fetching updates starting from ID {self.last_update_id + 1}")

        params = {
            "offset": self.last_update_id + 1,
            "timeout": 30,
            "allowed_updates": json.dumps(["message"]),
        }

        return self._telegram_request("getUpdates", params)

    def process_message(self, message: Dict) -> Dict:
        """Process a single message into structured data."""
        timestamp = datetime.fromtimestamp(message["date"]).isoformat()
        message_id = f"msg_{message['date']}_{message['message_id']}"

        message_data = {
            "id": message_id,
            "telegram_message_id": message["message_id"],
            "content": message.get("text") or message.get("caption", ""),
            "images": [],
            "timestamp": timestamp,
            "status": "pending",
            "tags": [],
            "created_at": datetime.utcnow().isoformat(),
            "chat_id": message["chat"]["id"],
            "from_user": {
                "id": message["from"]["id"],
                "username": message["from"].get("username"),
                "first_name": message["from"].get("first_name"),
                "last_name": message["from"].get("last_name"),
            },
        }

        # Process images if present
        if isinstance(message, dict) and "photo" in message and message["photo"]:
            image_info = self._process_image(message, message_id)
            if image_info:
                message_data["images"].append(image_info)

        return message_data

    def _process_image(self, message: Dict, message_id: str) -> Optional[Dict]:
        """Download and store image from message."""
        try:
            # Get largest photo
            photo = message["photo"][-1]
            file_info = self._telegram_request("getFile", {"file_id": photo["file_id"]})

            if not isinstance(file_info, dict) or "file_path" not in file_info:
                return None

            # Download image
            file_url = f"https://api.telegram.org/file/bot{self.bot_token}/{file_info['file_path']}"
            with urllib.request.urlopen(file_url) as response:
                image_data = response.read()

            # Upload to GitHub
            filename = f"{message_id}_{photo['file_id']}.jpg"
            image_path = f"static/images/{message_id}/{filename}"

            image_base64 = base64.b64encode(image_data).decode("utf-8")

            try:
                self._github_request(
                    "PUT",
                    f"/repos/{self.github_owner}/{self.github_repo}/contents/{image_path}",
                    {
                        "message": f"Add image from Telegram message {message_id}",
                        "content": image_base64,
                        "committer": {
                            "name": "Telegram Bot",
                            "email": "bot@telegram.org",
                        },
                    },
                )
                print(f"Uploaded image: {filename}")
            except Exception as e:
                print(f"Error uploading image: {e}")
                return None

            return {
                "filename": filename,
                "path": f"/images/{message_id}/{filename}",
                "caption": message.get("caption", ""),
                "file_id": photo["file_id"],
                "file_size": photo.get("file_size"),
            }

        except Exception as e:
            print(f"Error processing image: {e}")
            return None

    def add_to_pending_queue(self, message_data: Dict):
        """Add message to pending queue."""
        # Get current pending messages
        pending_data = None
        pending_json = self._github_get_file("data/pending-messages.json")

        if pending_json:
            try:
                pending_data = json.loads(pending_json)
            except json.JSONDecodeError:
                print("Error parsing pending-messages.json, creating new structure")

        if not pending_data:
            pending_data = {
                "messages": [],
                "lastUpdated": datetime.utcnow().isoformat(),
                "version": "1.0",
            }

        # Add new message
        pending_data["messages"].append(message_data)
        pending_data["lastUpdated"] = datetime.utcnow().isoformat()

        # Save back to GitHub
        content = json.dumps(pending_data, indent=2)
        self._github_create_or_update_file(
            "data/pending-messages.json",
            content,
            f"Add pending message {message_data['id']}",
        )

        print(f"Added message to pending queue: {message_data['id']}")

    def run(self):
        """Main execution flow."""
        try:
            print("Starting Telegram update fetch...")

            updates = self.fetch_updates()

            if not updates:
                print("No new updates found")
                return

            print(f"Found {len(updates)} new updates")

            processed_count = 0
            last_id = self.last_update_id

            for update in updates:
                last_id = update["update_id"]

                # Only process message updates
                if not isinstance(update, dict) or "message" not in update:
                    continue

                message = update["message"]

                # Skip bot messages or messages without content
                if message.get("from", {}).get("is_bot"):
                    continue

                if (
                    not message.get("text")
                    and not message.get("photo")
                    and not message.get("caption")
                ):
                    continue

                try:
                    message_data = self.process_message(message)
                    self.add_to_pending_queue(message_data)
                    processed_count += 1
                except Exception as e:
                    print(f"Error processing message {message.get('message_id')}: {e}")

            # Save last processed update ID
            if last_id > self.last_update_id:
                self._save_last_update_id(last_id)

            print(f"Successfully processed {processed_count} messages")

        except Exception as e:
            print(f"Error in main execution: {e}")
            sys.exit(1)


if __name__ == "__main__":
    fetcher = TelegramFetcher()
    fetcher.run()
