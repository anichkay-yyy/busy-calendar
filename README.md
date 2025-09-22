# Fast init
## ENV
```
ICLOUD_ID=...@icloud.com
ICLOUD_APP_PASSWORD=...
```
## Get app password
[[https://appleid.apple.com]]
“Sign-In and Security” → “App-Specific Passwords”

## Change manifest (/public/manifest.webmanifest)
Change fields: name, short_name.

# Change /api/ignore.json.
Add to the array the names of calendars that you wouldn't use for scheduling.
My example: "Уник (скип)"

## Good luck!
