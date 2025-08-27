# Contrast Detective

A minimal Chrome extension that analyzes web pages for WCAG AA color contrast compliance.

## Features

- ✅ One-click contrast analysis
- 🎯 WCAG AA compliance checking (3:1 ratio minimum)
- 📊 Detailed violation reporting
- 🚀 No external dependencies
- 💾 Minimal size (<10KB)

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The Contrast Detective icon will appear in your toolbar

## Usage

1. Navigate to any webpage
2. Click the Contrast Detective icon in your toolbar
3. Click "Analyze Current Page" 
4. View any contrast violations found

## Files

- `manifest.json` - Extension configuration
- `index.html` - Popup interface
- `popup.js` - Main extension logic and contrast analysis

## How it works

The extension analyzes the colors of visible elements on the current page by:
1. Extracting background and text colors from computed styles
2. Calculating contrast ratios using WCAG formulas
3. Reporting elements that don't meet the 3:1 minimum ratio

No data is sent to external servers - all analysis happens locally in your browser.
