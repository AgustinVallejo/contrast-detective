/**
 * CONTRAST DETECTIVE - Chrome Extension Popup Script
 * 
 * This script provides the main functionality for the Contrast Detective extension,
 * which analyzes web pages for WCAG AA color contrast compliance warnings.
 * 
 * Features:
 * - Screenshot capture and analysis
 * - Interactive zoom and pan controls
 * - Adjustable contrast threshold filtering
 * - Real-time warning visualization with pink overlays
 * 
 * @author AgustinVallejo
 * @version 1.0
 */

// Chrome extension popup script
document.addEventListener('DOMContentLoaded', function() {
    // =============================================================================
    // DOM ELEMENT REFERENCES
    // =============================================================================
    
    // Main UI elements
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsDiv = document.getElementById('results');
    const screenshotContainer = document.getElementById('screenshotContainer');
    
    // Zoom control elements
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const zoomLevelSpan = document.getElementById('zoomLevel');
    
    // Threshold control elements
    const thresholdControls = document.getElementById('thresholdControls');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const thresholdValue = document.getElementById('thresholdValue');

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================
    
    // Zoom and pan state
    let currentZoom = 1;                    // Current zoom level (1.0 = 100%)
    let currentScreenshot = null;           // Reference to the current screenshot element
    let isDragging = false;                 // Flag for drag operation
    let dragStart = { x: 0, y: 0 };        // Starting position for drag
    let imagePosition = { x: 0, y: 0 };    // Current image pan position
    
    // Analysis state
    let currentThreshold = 1.0;             // Current contrast threshold filter
    let allWarnings = [];                   // Store all detected warnings
    let filteredWarnings = [];             // Store filtered warnings based on threshold

    // =============================================================================
    // MAIN ANALYSIS WORKFLOW
    // =============================================================================
    
    /**
     * Main analysis button click handler
     * Orchestrates the entire contrast analysis workflow:
     * 1. Captures screenshot of active tab
     * 2. Displays screenshot with zoom controls
     * 3. Analyzes image for contrast warnings
     * 4. Shows results with interactive filtering
     */

    analyzeBtn.addEventListener('click', async function() {
        // Reset UI state for new analysis
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Capturing...';
        resultsDiv.innerHTML = '<div class="loading">Capturing screenshot...</div>';
        screenshotContainer.innerHTML = '';
        thresholdControls.style.display = 'none';
        resetZoom();

        try {
            // Step 1: Capture screenshot of the active browser tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
                format: 'png',    // Use PNG for better quality analysis
                quality: 90       // High quality for accurate color detection
            });
            
            // Step 2: Display the captured screenshot with zoom controls
            displayScreenshot(dataUrl);
            
            // Step 3: Begin contrast analysis
            analyzeBtn.textContent = 'Analyzing...';
            resultsDiv.innerHTML = '<div class="loading">Analyzing contrast...</div>';
            
            // Step 4: Perform the actual contrast analysis
            const warnings = await analyzeScreenshot(dataUrl);
            
            // Step 5: Display analysis results with filtering options
            displayResults(warnings);
            
        } catch (error) {
            console.error('Analysis error:', error);
            resultsDiv.innerHTML = `<div class="warning">Error: ${error.message}</div>`;
        } finally {
            // Reset button state regardless of success/failure
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze Current Page';
        }
    });

    // =============================================================================
    // ZOOM CONTROLS
    // =============================================================================
    
    /**
     * Zoom control event listeners
     * Provides interactive zoom functionality for detailed warning inspection
     */
    zoomInBtn.addEventListener('click', function() {
        zoomIn();
    });

    zoomOutBtn.addEventListener('click', function() {
        zoomOut();
    });

    resetZoomBtn.addEventListener('click', function() {
        resetZoom();
    });

    // =============================================================================
    // THRESHOLD FILTERING
    // =============================================================================
    
    /**
     * Threshold slider event listener
     * Allows real-time filtering of warnings based on contrast ratio
     * Lower values show more warnings, higher values hide minor issues
     */
    thresholdSlider.addEventListener('input', function() {
        currentThreshold = parseFloat(thresholdSlider.value);
        thresholdValue.textContent = currentThreshold.toFixed(1);
        
        // Re-filter and redraw warnings based on new threshold
        if (allWarnings.length > 0) {
            filterAndRedrawWarnings();
        }
    });

    // =============================================================================
    // KEYBOARD SHORTCUTS
    // =============================================================================
    
    /**
     * Keyboard shortcuts for enhanced user experience
     * +/- : Zoom in/out
     * 0   : Reset zoom
     * Arrow keys: Pan when zoomed
     */
    document.addEventListener('keydown', function(e) {
        if (!currentScreenshot) return;
        
        switch(e.key) {
            case '+':
            case '=':
                e.preventDefault();
                zoomIn();
                break;
            case '-':
                e.preventDefault();
                zoomOut();
                break;
            case '0':
                e.preventDefault();
                resetZoom();
                break;
            case 'ArrowLeft':
                if (currentZoom > 1) {
                    e.preventDefault();
                    imagePosition.x += 20 / currentZoom;
                    updateZoom();
                }
                break;
            case 'ArrowRight':
                if (currentZoom > 1) {
                    e.preventDefault();
                    imagePosition.x -= 20 / currentZoom;
                    updateZoom();
                }
                break;
            case 'ArrowUp':
                if (currentZoom > 1) {
                    e.preventDefault();
                    imagePosition.y += 20 / currentZoom;
                    updateZoom();
                }
                break;
            case 'ArrowDown':
                if (currentZoom > 1) {
                    e.preventDefault();
                    imagePosition.y -= 20 / currentZoom;
                    updateZoom();
                }
                break;
        }
    });

    // =============================================================================
    // WARNING FILTERING FUNCTIONS
    // =============================================================================
    
    /**
     * Filters and redraws warnings based on the current threshold setting
     * 
     * This function applies the user's contrast threshold filter to hide low-contrast
     * warnings (like subtle gradients) and focus on more significant accessibility issues.
     * 
     * @description Filters warnings where ratio >= currentThreshold
     * @updates filteredWarnings array and redraws the screenshot
     */
    function filterAndRedrawWarnings() {
        // Filter warnings: show only those with contrast ratios above threshold
        // This hides minor issues (close to 1:1) and emphasizes serious problems
        filteredWarnings = allWarnings.filter(warning => warning.ratio >= currentThreshold);
        
        // Update the visual display with filtered results
        if (currentScreenshot) {
            redrawWarningsOnScreenshot();  // Redraw pink overlays
            displayResults(filteredWarnings); // Update statistics
        }
    }

    /**
     * Redraws the screenshot canvas with filtered warning overlays
     * 
     * This function clears the current canvas and redraws it with:
     * 1. The original screenshot image
     * 2. Pink overlay rectangles for warnings that pass the current filter
     */
    function redrawWarningsOnScreenshot() {
        // Get the original image data and redraw with filtered warnings
        const canvas = currentScreenshot.tagName === 'CANVAS' ? currentScreenshot : null;
        if (canvas) {
            // Clear the canvas and redraw the original image with filtered warnings
            const ctx = canvas.getContext('2d');
            
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Redraw the original screenshot image from stored data
            if (window.originalImageData) {
                ctx.putImageData(window.originalImageData, 0, 0);
            }
            
            // Apply filtered warning overlays to the clean image
            drawWarningsOnCanvas(ctx, filteredWarnings);
        }
    }

    // =============================================================================
    // ZOOM FUNCTIONALITY
    // =============================================================================
    
    /**
     * Increases zoom level for detailed warning inspection
     * 
     * @description Zooms in by 1.5x up to maximum of 4x (400%)
     * @range 100% to 400%
     */
    function zoomIn() {
        if (currentZoom < 4) {
            currentZoom = Math.min(4, currentZoom * 1.5);
            updateZoom();
        }
    }

    /**
     * Decreases zoom level back towards natural screenshot size
     * 
     * @description Zooms out by 1.5x down to minimum of 1x (100%)
     * @range 100% to 400% (cannot zoom smaller than original)
     */
    function zoomOut() {
        if (currentZoom > 1) {
            currentZoom = Math.max(1, currentZoom / 1.5);
            updateZoom();
        }
    }

    /**
     * Resets zoom to original size and centers the image
     * 
     * @description Restores zoom to 100% and clears any pan offset
     */
    function resetZoom() {
        currentZoom = 1;                    // Back to 100%
        imagePosition = { x: 0, y: 0 };    // Center the image
        updateZoom();
    }

    /**
     * Applies current zoom and pan transformations to the screenshot
     * 
     * @description Updates CSS transform, zoom level display, and button states
     * @updates Screenshot transform, UI elements, cursor styles
     */
    function updateZoom() {
        if (currentScreenshot) {
            // Apply CSS transform for zoom and pan
            const transform = `scale(${currentZoom}) translate(${imagePosition.x}px, ${imagePosition.y}px)`;
            currentScreenshot.style.transform = transform;
            
            // Update zoom level display (e.g., "150%")
            zoomLevelSpan.textContent = `${Math.round(currentZoom * 100)}%`;
            
            // Update zoom button enabled/disabled states
            zoomInBtn.disabled = currentZoom >= 4;      // Disable at 400% max
            zoomOutBtn.disabled = currentZoom <= 1;     // Disable at 100% min
            
            // Update cursor style based on interaction capability
            if (currentZoom > 1) {
                // When zoomed, enable drag cursor
                currentScreenshot.style.cursor = isDragging ? 'grabbing' : 'grab';
            } else {
                // At 100%, no dragging needed
                currentScreenshot.style.cursor = 'default';
            }
        }
    }

    // =============================================================================
    // SCREENSHOT DISPLAY & INTERACTION
    // =============================================================================
    
    /**
     * Displays the captured screenshot with interactive controls
     * 
     * @param {string} dataUrl - Base64 encoded PNG image data
     * @description Creates an image element with zoom, pan, and scroll capabilities
     */
    function displayScreenshot(dataUrl) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'screenshot';
        img.alt = 'Page screenshot';
        
        // Enable interactive mouse controls
        img.addEventListener('mousedown', handleMouseDown);  // Start drag operation
        img.addEventListener('wheel', handleWheel);          // Mouse wheel zoom
        
        // Prevent browser default behaviors that interfere with our controls
        img.addEventListener('dragstart', e => e.preventDefault());     // No image drag
        img.addEventListener('contextmenu', e => e.preventDefault());   // No right-click menu
        
        // Replace any existing screenshot while preserving zoom controls
        const existingScreenshot = screenshotContainer.querySelector('.screenshot');
        if (existingScreenshot) {
            existingScreenshot.remove();
        }
        
        // Add the new screenshot to the container
        screenshotContainer.appendChild(img);
        currentScreenshot = img;
        resetZoom();    // Start at 100% zoom, centered
    }

    // =============================================================================
    // MOUSE INTERACTION HANDLERS
    // =============================================================================
    
    /**
     * Initiates drag operation for panning when zoomed
     * 
     * @param {MouseEvent} e - Mouse down event
     * @description Only activates when zoom > 100% (panning is useful)
     */
    function handleMouseDown(e) {
        if (currentZoom <= 1) return;   // No panning needed at 100% zoom
        
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };     // Record starting position
        currentScreenshot.style.cursor = 'grabbing';   // Visual feedback
        
        // Attach global mouse listeners for smooth dragging
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    }

    /**
     * Handles mouse movement during drag operation
     * 
     * @param {MouseEvent} e - Mouse move event
     * @description Calculates pan offset based on mouse movement and current zoom level
     */
    function handleMouseMove(e) {
        if (!isDragging) return;
        
        // Calculate movement delta, accounting for zoom level
        const deltaX = (e.clientX - dragStart.x) / currentZoom;
        const deltaY = (e.clientY - dragStart.y) / currentZoom;
        
        // Update image position
        imagePosition.x += deltaX;
        imagePosition.y += deltaY;
        
        // Update reference point for next movement calculation
        dragStart = { x: e.clientX, y: e.clientY };
        updateZoom();   // Apply the new position
    }

    /**
     * Ends drag operation and cleans up event listeners
     */
    function handleMouseUp() {
        isDragging = false;
        currentScreenshot.style.cursor = 'grab';    // Return to grab cursor
        
        // Remove global event listeners to prevent memory leaks
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    /**
     * Handles mouse wheel scrolling for zoom control
     * 
     * @param {WheelEvent} e - Mouse wheel event
     * @description Scroll up to zoom in, scroll down to zoom out
     */
    function handleWheel(e) {
        e.preventDefault();     // Prevent page scrolling
        
        if (e.deltaY < 0) {
            zoomIn();           // Scroll up = zoom in
        } else {
            zoomOut();          // Scroll down = zoom out
        }
    }

    // =============================================================================
    // CORE CONTRAST ANALYSIS ENGINE
    // =============================================================================
    
    /**
     * Analyzes a screenshot for contrast warnings using WCAG guidelines
     * 
     * @param {string} dataUrl - Base64 encoded screenshot image
     * @returns {Promise<Array>} Array of warning objects with position and severity data
     * 
     * @description This is the main analysis engine that:
     * 1. Converts the screenshot to canvas for pixel analysis
     * 2. Divides image into 16x16 pixel blocks
     * 3. Extracts dominant colors from each block
     * 4. Calculates WCAG contrast ratios
     * 5. Identifies areas that fail contrast requirements
     * 6. Draws pink overlay warnings on problematic areas
     */
    async function analyzeScreenshot(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Set canvas to image size
                canvas.width = img.width;
                canvas.height = img.height;
                
                // Draw image to canvas
                ctx.drawImage(img, 0, 0);
                
                // Store original image data for redrawing
                window.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // Get image data
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // Analyze using grid analysis with smaller blocks for more detail
                allWarnings = gridAnalysis(imageData, 16);
                
                // Filter warnings based on current threshold
                filteredWarnings = allWarnings.filter(warning => warning.ratio >= currentThreshold);
                
                // Draw filtered warnings on canvas
                drawWarningsOnCanvas(ctx, filteredWarnings);
                
                // Replace the screenshot with the annotated version
                displayAnnotatedScreenshot(canvas);
                
                // Show threshold controls
                thresholdControls.style.display = 'block';
                
                resolve(filteredWarnings);
            };
            img.src = dataUrl;
        });
    }

    function drawWarningsOnCanvas(ctx, warnings) {
        // Draw warning overlays using the same style as the original React component
        warnings.forEach(warning => {
            const opacity = warning.score; // Use severity score for opacity
            const blockSize = 16; // Match the analysis block size
            
            // Deep pink color like the original, with opacity based on score
            ctx.fillStyle = `rgba(255, 20, 147, ${opacity * 0.6 + 0.1})`;
            ctx.fillRect(warning.x, warning.y, blockSize, blockSize);
            
            // Stroke with slightly higher opacity
            ctx.strokeStyle = `rgba(255, 20, 147, ${opacity * 0.8 + 0.2})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(warning.x, warning.y, blockSize, blockSize);
        });
    }

    function displayAnnotatedScreenshot(canvas) {
        canvas.className = 'screenshot';
        
        // Add drag functionality to canvas
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('wheel', handleWheel);
        
        // Prevent image selection and context menu
        canvas.addEventListener('dragstart', e => e.preventDefault());
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        
        // Remove the old screenshot but keep the controls
        const existingScreenshot = screenshotContainer.querySelector('.screenshot');
        if (existingScreenshot) {
            existingScreenshot.remove();
        }
        
        screenshotContainer.appendChild(canvas);
        currentScreenshot = canvas;
        updateZoom();
    }

    function displayResults(warnings) {
        if (!warnings || warnings.length === 0) {
            const totalWarnings = allWarnings.length;
            if (totalWarnings > 0) {
                resultsDiv.innerHTML = `
                    <div class="no-warnings">
                        ✅ No warnings above ${currentThreshold.toFixed(1)}:1 threshold<br>
                        <small>${totalWarnings} total warnings found (${totalWarnings - warnings.length} hidden below threshold)</small>
                    </div>
                `;
            } else {
                resultsDiv.innerHTML = '<div class="no-warnings">✅ No contrast warnings found!</div>';
            }
            return;
        }

        // Calculate summary statistics
        const worstRatio = Math.min(...warnings.map(v => v.ratio));
        const avgScore = warnings.reduce((sum, v) => sum + v.score, 0) / warnings.length;
        const totalWarnings = allWarnings.length;
        const filteredCount = warnings.length;
        const hiddenCount = totalWarnings - filteredCount;
        
        const filterInfo = hiddenCount > 0 ? 
            `<br>� Showing ${filteredCount} warnings (${hiddenCount} hidden below ${currentThreshold.toFixed(1)}:1)` : 
            `<br>📊 Showing all ${totalWarnings} warnings`;
        
        const summaryHtml = `
            <div style="background: #374151; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                <strong>Contrast Analysis Results</strong><br>
                <div style="margin-top: 8px;">
                    ⚠️ Visible warnings: ${filteredCount}<br>
                    🎯 Block size: 16×16 pixels${filterInfo}
                </div>
            </div>
            <div style="font-size: 11px; color: #94a3b8; text-align: center;">
                Pink overlays show contrast warnings.<br>
                Opacity indicates severity (darker = worse)
            </div>
        `;

        resultsDiv.innerHTML = summaryHtml;
    }

    // =============================================================================
    // WCAG CONTRAST CALCULATION FUNCTIONS
    // =============================================================================
    
    /**
     * Converts sRGB color component to linear RGB for luminance calculation
     * 
     * @param {number} component - Color component value (0-255)
     * @returns {number} Linear RGB value for luminance calculation
     * 
     * @description Implements the sRGB to linear RGB conversion formula from WCAG 2.1
     * This is required for accurate relative luminance calculation
     */
    function sRGBToLinear(component) {
        const c = component / 255;  // Normalize to 0-1 range
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    /**
     * Calculates relative luminance of an RGB color per WCAG 2.1 standards
     * 
     * @param {number} r - Red component (0-255)
     * @param {number} g - Green component (0-255)  
     * @param {number} b - Blue component (0-255)
     * @returns {number} Relative luminance value (0-1)
     * 
     * @description Uses the WCAG formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
     * where R, G, B are linear RGB values
     */
    function getRelativeLuminance(r, g, b) {
        const R = sRGBToLinear(r);
        const G = sRGBToLinear(g);
        const B = sRGBToLinear(b);
        // WCAG luminance formula with standard coefficients for human vision
        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    }

    /**
     * Calculates the contrast ratio between two colors per WCAG 2.1 guidelines
     * 
     * @param {Object} rgb1 - First color {r, g, b}
     * @param {Object} rgb2 - Second color {r, g, b}  
     * @returns {number} Contrast ratio (1:1 to 21:1)
     * 
     * @description Uses the WCAG formula: (L1 + 0.05) / (L2 + 0.05)
     * where L1 is lighter color and L2 is darker color
     * Returns 21 for identical colors to avoid division issues
     */
    function getContrastRatio(rgb1, rgb2) {
        // Handle identical colors case
        if (rgb1.r === rgb2.r && rgb1.g === rgb2.g && rgb1.b === rgb2.b) {
            return 21;  // Maximum theoretical ratio to avoid false warnings
        }

        // Calculate relative luminance for both colors
        const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
        const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
        
        // Apply WCAG contrast ratio formula
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        
        return (lighter + 0.05) / (darker + 0.05);
    }

    /**
     * Converts contrast ratio to a warning severity score
     * 
     * @param {number} ratio - Contrast ratio (1:1 to 21:1)
     * @returns {number} Severity score (0-1, where 1 = most severe)
     * 
     * @description Maps contrast ratios to visual warning intensity:
     * - 3.0:1 and above = 0 (no warning, WCAG AA compliant)
     * - 1.0:1 = 1.0 (maximum warning, no contrast)
     * - Between 1-3 = smooth curve using cosine interpolation
     */
    function uiContrastWarningScore(ratio) {
        // No warning for WCAG AA compliant contrasts
        if (ratio >= 3.0) return 0;
        
        // Maximum warning for no contrast
        if (ratio <= 1.0) return 1.0;
        
        // Smooth interpolation between warning levels using cosine curve
        const t = (ratio - 1.0) / (3.0 - 1.0);  // Normalize ratio to 0-1 range
        return 0.5 * (1 + Math.cos(Math.PI * t));  // Cosine curve from 1 to 0
    }

    // Color Analysis and Clustering Functions
    // =====================================

    /**
     * Performs K-means clustering to identify dominant color regions
     * 
     * @param {ImageData} imageData - Canvas image data to analyze
     * @param {number} k - Number of color clusters to create
     * @returns {Object} Clustering results with centers and assignments
     * 
     * @description Implements Lloyd's algorithm for color quantization:
     * 1. Initialize k random color centroids
     * 2. Assign each pixel to nearest centroid
     * 3. Recalculate centroids based on assignments
     * 4. Repeat until convergence or max iterations
     * Used to simplify color analysis by reducing color space
     */
    function simpleKMeans(colors, k) {
        // Handle edge case where we have fewer colors than clusters requested
        if (colors.length <= k) return colors;
        
        // Initialize centroids with first k colors
        let centroids = colors.slice(0, k).map(c => ({...c}));
        
        // Iterate to improve clustering (max 10 iterations for performance)
        for (let iteration = 0; iteration < 10; iteration++) {
            const clusters = Array(k).fill(0).map(() => []);
            
            // Assign each color to nearest centroid using Euclidean distance
            colors.forEach(color => {
                let minDistance = Infinity;
                let closestCluster = 0;
                
                centroids.forEach((centroid, i) => {
                    // Calculate distance in RGB color space
                    const distance = Math.sqrt(
                        Math.pow(color.r - centroid.r, 2) +
                        Math.pow(color.g - centroid.g, 2) +
                        Math.pow(color.b - centroid.b, 2)
                    );
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestCluster = i;
                    }
                });
                clusters[closestCluster].push(color);
            });
            
            // Recalculate centroids as cluster averages
            const newCentroids = clusters.map((cluster, i) => {
                if (cluster.length === 0) return centroids[i];  // Keep empty cluster centroid
                
                // Calculate average RGB values for the cluster
                const avgR = cluster.reduce((sum, c) => sum + c.r, 0) / cluster.length;
                const avgG = cluster.reduce((sum, c) => sum + c.g, 0) / cluster.length;
                const avgB = cluster.reduce((sum, c) => sum + c.b, 0) / cluster.length;
                
                return { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) };
            });

            // Check for convergence (centroids no longer changing)
            if (JSON.stringify(newCentroids) === JSON.stringify(centroids)) {
                break;
            }
            centroids = newCentroids;
        }
        
        return centroids;
    }

    /**
     * Extracts dominant colors from a specific region of the image
     * 
     * @param {ImageData} imageData - Canvas image data
     * @param {number} x - X coordinate of region start
     * @param {number} y - Y coordinate of region start  
     * @param {number} width - Width of region to analyze
     * @param {number} height - Height of region to analyze
     * @param {number} maxColors - Maximum number of dominant colors to return
     * @returns {Array} Array of dominant color objects {r, g, b}
     * 
     * @description Samples pixels from the specified region (every 2nd pixel for performance)
     * then uses K-means clustering to identify the most common colors
     */
    function extractDominantColors(imageData, x, y, width, height, maxColors = 2) {
        const data = imageData.data;
        const colors = [];
        const imageWidth = imageData.width;
        
        // Sample every 2nd pixel for performance while maintaining color accuracy
        for (let dy = 0; dy < height; dy += 2) {
            for (let dx = 0; dx < width; dx += 2) {
                const px = x + dx;
                const py = y + dy;
                
                // Bounds checking
                if (px >= imageWidth || py >= imageData.height) continue;

                const idx = (py * imageWidth + px) * 4;  // RGBA pixel index
                
                colors.push({
                    r: data[idx],
                    g: data[idx + 1],
                    b: data[idx + 2]
                });
            }
        }
        
        // Handle empty region case
        if(colors.length === 0) return [];
        
        // Apply K-means clustering to find dominant colors
        return simpleKMeans(colors, maxColors);
    }

    // Grid-based Analysis Functions
    // ============================

    function analyzeUIRegion(imageData, x, y, width, height) {
        const colors = extractDominantColors(imageData, x, y, width, height, 2);
        
        if (colors.length < 2) {
            return { score: 0, ratio: 21, colors, compliant: true };
        }
        
        const ratio = getContrastRatio(colors[0], colors[1]);
        const score = uiContrastWarningScore(ratio);
        
        return {
            score,
            ratio,
            colors,
            compliant: ratio >= 3.0 // Still use 3.0 as the WCAG AA baseline
        };
    }

    function gridAnalysis(imageData, blockSize) {
        const { width, height } = imageData;
        const results = [];

        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                const w = Math.min(blockSize, width - x);
                const h = Math.min(blockSize, height - y);

                if (w < 4 || h < 4) continue;

                const regionResult = analyzeUIRegion(imageData, x, y, w, h);
                
                // Capture all warnings below 3.0:1 (WCAG AA), not just below current threshold
                if (!regionResult.compliant) {
                    results.push({
                        ...regionResult,
                        x,
                        y,
                    });
                }
            }
        }
        return results; // Return all warnings below 3.0:1
    }
});
