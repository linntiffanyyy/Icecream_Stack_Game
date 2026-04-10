# Scoop Stack

A cute Electron game where you jump on ice cream scoops to build the tallest cone.

## Run locally

```bash
npm install
npm start
```

## Build

```bash
npm run dist:win
npm run dist:mac
```

## Build On Mac

On a Mac, someone can build the macOS app with just:

```bash
npm install
npm run dist:mac
```

The generated macOS installer will appear in the `dist/` folder as a `.dmg` file.

## Release Upload

Upload the built installer files from `dist/` to GitHub Releases:

- Windows: `.exe`
- macOS: `.dmg`

## Notes

- Windows builds are created on Windows.
- macOS builds are usually created on a Mac.
