# Publishing this game

## Upload to GitHub
1. Make a new empty public repository named `shattered-accord` at https://github.com/new.
2. Open the repository, choose **Add file → Upload files**.
3. Extract the Shattered Accord Publish Ready ZIP and drag ALL FILES from inside the extracted folder to the GitHub upload panel; keep index.html at repository ROOT (not in a nested folder).
4. Commit the upload to the `main` branch.
5. Give the repository URL to ChatGPT to connect it to Render as a Static Site, `buildCommand: echo Static build ready`, `publishPath: ./`, `branch: main`.

## Limits
This is a public copy of the current local version. It has playable 1v1 vs bot, not working online multiplayer. Public web hosting does not automatically provide multiplayer networking. Search-engine indexing is not immediate or guaranteed.
