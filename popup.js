// Chrome extension popup script
document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsDiv = document.getElementById('results');
    const screenshotContainer = document.getElementById('screenshotContainer');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const zoomLevelSpan = document.getElementById('zoomLevel');
    const thresholdControls = document.getElementById('thresholdControls');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const thresholdValue = document.getElementById('thresholdValue');

    let currentZoom = 1;
    let currentScreenshot = null;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let imagePosition = { x: 0, y: 0 };
    let currentThreshold = 1.0;
    let allViolations = []; // Store all violations
    let filteredViolations = []; // Store filtered violations

    analyzeBtn.addEventListener('click', async function() {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Capturing...';
        resultsDiv.innerHTML = '<div class="loading">Capturing screenshot...</div>';
        screenshotContainer.innerHTML = '';
        thresholdControls.style.display = 'none';
        resetZoom();

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Capture a screenshot of the visible tab
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
                format: 'png',
                quality: 90
            });
            
            // Display the screenshot
            displayScreenshot(dataUrl);
            
            // Now analyze the screenshot
            analyzeBtn.textContent = 'Analyzing...';
            resultsDiv.innerHTML = '<div class="loading">Analyzing contrast...</div>';
            
            // Create an image and analyze it
            const violations = await analyzeScreenshot(dataUrl);
            displayResults(violations);
            
        } catch (error) {
            console.error('Analysis error:', error);
            resultsDiv.innerHTML = `<div class="violation">Error: ${error.message}</div>`;
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze Current Page';
        }
    });

    // Zoom control event listeners
    zoomInBtn.addEventListener('click', function() {
        zoomIn();
    });

    zoomOutBtn.addEventListener('click', function() {
        zoomOut();
    });

    resetZoomBtn.addEventListener('click', function() {
        resetZoom();
    });

    // Threshold slider event listener
    thresholdSlider.addEventListener('input', function() {
        currentThreshold = parseFloat(thresholdSlider.value);
        thresholdValue.textContent = currentThreshold.toFixed(1);
        
        // Re-filter and redraw violations
        if (allViolations.length > 0) {
            filterAndRedrawViolations();
        }
    });

    // Keyboard shortcuts
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

    // Threshold filtering function
    function filterAndRedrawViolations() {
        // Filter violations based on current threshold - show only violations BELOW the threshold
        // (i.e., hide low-contrast violations that are close to 1:1)
        filteredViolations = allViolations.filter(violation => violation.ratio >= currentThreshold);
        
        // Redraw the screenshot with filtered violations
        if (currentScreenshot) {
            redrawViolationsOnScreenshot();
            displayResults(filteredViolations);
        }
    }

    function redrawViolationsOnScreenshot() {
        // Get the original image data and redraw with filtered violations
        const canvas = currentScreenshot.tagName === 'CANVAS' ? currentScreenshot : null;
        if (canvas) {
            // Clear the canvas and redraw the original image with filtered violations
            const ctx = canvas.getContext('2d');
            
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Redraw the original image (we need to store this separately)
            if (window.originalImageData) {
                ctx.putImageData(window.originalImageData, 0, 0);
            }
            
            // Draw filtered violations
            drawViolationsOnCanvas(ctx, filteredViolations);
        }
    }

    // Zoom functions
    function zoomIn() {
        if (currentZoom < 4) {
            currentZoom = Math.min(4, currentZoom * 1.5);
            updateZoom();
        }
    }

    function zoomOut() {
        if (currentZoom > 1) {
            currentZoom = Math.max(1, currentZoom / 1.5);
            updateZoom();
        }
    }

    function resetZoom() {
        currentZoom = 1;
        imagePosition = { x: 0, y: 0 };
        updateZoom();
    }

    function updateZoom() {
        if (currentScreenshot) {
            const transform = `scale(${currentZoom}) translate(${imagePosition.x}px, ${imagePosition.y}px)`;
            currentScreenshot.style.transform = transform;
            zoomLevelSpan.textContent = `${Math.round(currentZoom * 100)}%`;
            
            // Update button states
            zoomInBtn.disabled = currentZoom >= 4;
            zoomOutBtn.disabled = currentZoom <= 1; // Can't zoom out beyond 100%
            
            // Update cursor based on zoom level
            if (currentZoom > 1) {
                currentScreenshot.style.cursor = isDragging ? 'grabbing' : 'grab';
            } else {
                currentScreenshot.style.cursor = 'default';
            }
        }
    }

    function displayScreenshot(dataUrl) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'screenshot';
        img.alt = 'Page screenshot';
        
        // Add drag functionality
        img.addEventListener('mousedown', handleMouseDown);
        img.addEventListener('wheel', handleWheel);
        
        // Prevent image selection and context menu
        img.addEventListener('dragstart', e => e.preventDefault());
        img.addEventListener('contextmenu', e => e.preventDefault());
        
        // Clear existing screenshot but keep controls
        const existingScreenshot = screenshotContainer.querySelector('.screenshot');
        if (existingScreenshot) {
            existingScreenshot.remove();
        }
        
        screenshotContainer.appendChild(img);
        currentScreenshot = img;
        resetZoom();
    }

    // Mouse drag handlers for panning
    function handleMouseDown(e) {
        if (currentZoom <= 1) return;
        
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        currentScreenshot.style.cursor = 'grabbing';
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    }

    function handleMouseMove(e) {
        if (!isDragging) return;
        
        const deltaX = (e.clientX - dragStart.x) / currentZoom;
        const deltaY = (e.clientY - dragStart.y) / currentZoom;
        
        imagePosition.x += deltaX;
        imagePosition.y += deltaY;
        
        dragStart = { x: e.clientX, y: e.clientY };
        updateZoom();
    }

    function handleMouseUp() {
        isDragging = false;
        currentScreenshot.style.cursor = 'grab';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    // Mouse wheel zoom support
    function handleWheel(e) {
        e.preventDefault();
        
        if (e.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    }

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
                allViolations = gridAnalysis(imageData, 16);
                
                // Filter violations based on current threshold
                filteredViolations = allViolations.filter(violation => violation.ratio >= currentThreshold);
                
                // Draw filtered violations on canvas
                drawViolationsOnCanvas(ctx, filteredViolations);
                
                // Replace the screenshot with the annotated version
                displayAnnotatedScreenshot(canvas);
                
                // Show threshold controls
                thresholdControls.style.display = 'block';
                
                resolve(filteredViolations);
            };
            img.src = dataUrl;
        });
    }

    function drawViolationsOnCanvas(ctx, violations) {
        // Draw violation overlays using the same style as the original React component
        violations.forEach(violation => {
            const opacity = violation.score; // Use severity score for opacity
            const blockSize = 16; // Match the analysis block size
            
            // Deep pink color like the original, with opacity based on score
            ctx.fillStyle = `rgba(255, 20, 147, ${opacity * 0.6 + 0.1})`;
            ctx.fillRect(violation.x, violation.y, blockSize, blockSize);
            
            // Stroke with slightly higher opacity
            ctx.strokeStyle = `rgba(255, 20, 147, ${opacity * 0.8 + 0.2})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(violation.x, violation.y, blockSize, blockSize);
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

    function displayResults(violations) {
        if (!violations || violations.length === 0) {
            const totalViolations = allViolations.length;
            if (totalViolations > 0) {
                resultsDiv.innerHTML = `
                    <div class="no-violations">
                        ✅ No violations above ${currentThreshold.toFixed(1)}:1 threshold<br>
                        <small>${totalViolations} total violations found (${totalViolations - violations.length} hidden below threshold)</small>
                    </div>
                `;
            } else {
                resultsDiv.innerHTML = '<div class="no-violations">✅ No contrast violations found!</div>';
            }
            return;
        }

        // Calculate summary statistics
        const worstRatio = Math.min(...violations.map(v => v.ratio));
        const avgScore = violations.reduce((sum, v) => sum + v.score, 0) / violations.length;
        const totalViolations = allViolations.length;
        const filteredCount = violations.length;
        const hiddenCount = totalViolations - filteredCount;
        
        const filterInfo = hiddenCount > 0 ? 
            `<br>� Showing ${filteredCount} violations (${hiddenCount} hidden below ${currentThreshold.toFixed(1)}:1)` : 
            `<br>📊 Showing all ${totalViolations} violations`;
        
        const summaryHtml = `
            <div style="background: #374151; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                <strong>Contrast Analysis Results</strong><br>
                <div style="margin-top: 8px;">
                    ⚠️ Visible violations: ${filteredCount}<br>
                    🎯 Block size: 16×16 pixels${filterInfo}
                </div>
            </div>
            <div style="font-size: 11px; color: #94a3b8; text-align: center;">
                Pink overlays show contrast violations.<br>
                Opacity indicates severity (darker = worse)
            </div>
        `;

        resultsDiv.innerHTML = summaryHtml;
    }

    // =============================================================================
    // WCAG Contrast Calculation Functions
    // =============================================================================

    function sRGBToLinear(component) {
        const c = component / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function getRelativeLuminance(r, g, b) {
        const R = sRGBToLinear(r);
        const G = sRGBToLinear(g);
        const B = sRGBToLinear(b);
        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    }

    function getContrastRatio(rgb1, rgb2) {
        if (rgb1.r === rgb2.r && rgb1.g === rgb2.g && rgb1.b === rgb2.b) {
            return 21;
        }

        const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
        const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
        
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        
        return (lighter + 0.05) / (darker + 0.05);
    }

    function uiContrastViolationScore(ratio) {
        // Always return a score for ratios below 3.0 (WCAG AA minimum)
        if (ratio >= 3.0) return 0;
        if (ratio <= 1.0) return 1.0;
        
        // Create a more nuanced scoring that works well with the threshold
        const t = (ratio - 1.0) / (3.0 - 1.0);
        return 0.5 * (1 + Math.cos(Math.PI * t));
    }

    function simpleKMeans(colors, k) {
        if (colors.length <= k) return colors;
        
        let centroids = colors.slice(0, k).map(c => ({...c}));
        
        for (let iteration = 0; iteration < 10; iteration++) {
            const clusters = Array(k).fill(0).map(() => []);
            
            colors.forEach(color => {
                let minDistance = Infinity;
                let closestCluster = 0;
                
                centroids.forEach((centroid, i) => {
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
            
            const newCentroids = clusters.map((cluster, i) => {
                if (cluster.length === 0) return centroids[i]; 
                
                const avgR = cluster.reduce((sum, c) => sum + c.r, 0) / cluster.length;
                const avgG = cluster.reduce((sum, c) => sum + c.g, 0) / cluster.length;
                const avgB = cluster.reduce((sum, c) => sum + c.b, 0) / cluster.length;
                
                return { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) };
            });

            if (JSON.stringify(newCentroids) === JSON.stringify(centroids)) {
                break;
            }
            centroids = newCentroids;
        }
        
        return centroids;
    }

    function extractDominantColors(imageData, x, y, width, height, maxColors = 2) {
        const data = imageData.data;
        const colors = [];
        const imageWidth = imageData.width;
        
        for (let dy = 0; dy < height; dy += 2) {
            for (let dx = 0; dx < width; dx += 2) {
                const px = x + dx;
                const py = y + dy;
                if (px >= imageWidth || py >= imageData.height) continue;

                const idx = (py * imageWidth + px) * 4;
                
                colors.push({
                    r: data[idx],
                    g: data[idx + 1],
                    b: data[idx + 2]
                });
            }
        }
        
        if(colors.length === 0) return [];
        
        return simpleKMeans(colors, maxColors);
    }

    function analyzeUIRegion(imageData, x, y, width, height) {
        const colors = extractDominantColors(imageData, x, y, width, height, 2);
        
        if (colors.length < 2) {
            return { score: 0, ratio: 21, colors, compliant: true };
        }
        
        const ratio = getContrastRatio(colors[0], colors[1]);
        const score = uiContrastViolationScore(ratio);
        
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
                
                // Capture all violations below 3.0:1 (WCAG AA), not just below current threshold
                if (!regionResult.compliant) {
                    results.push({
                        ...regionResult,
                        x,
                        y,
                    });
                }
            }
        }
        return results; // Return all violations below 3.0:1
    }
});
