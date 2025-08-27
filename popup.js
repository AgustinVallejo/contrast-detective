// Chrome extension popup script
document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsDiv = document.getElementById('results');
    const screenshotContainer = document.getElementById('screenshotContainer');

    analyzeBtn.addEventListener('click', async function() {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Capturing...';
        resultsDiv.innerHTML = '<div class="loading">Capturing screenshot...</div>';
        screenshotContainer.innerHTML = '';

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

    function displayScreenshot(dataUrl) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.className = 'screenshot';
        img.alt = 'Page screenshot';
        screenshotContainer.innerHTML = '';
        screenshotContainer.appendChild(img);
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
                
                // Get image data
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // Analyze using grid analysis with smaller blocks for more detail
                const violations = gridAnalysis(imageData, 16);
                
                // Draw violations on canvas
                drawViolationsOnCanvas(ctx, violations);
                
                // Replace the screenshot with the annotated version
                displayAnnotatedScreenshot(canvas);
                
                resolve(violations);
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
        screenshotContainer.innerHTML = '';
        screenshotContainer.appendChild(canvas);
    }

    function displayResults(violations) {
        if (!violations || violations.length === 0) {
            resultsDiv.innerHTML = '<div class="no-violations">✅ No contrast violations found!</div>';
            return;
        }

        // Calculate summary statistics
        const worstRatio = Math.min(...violations.map(v => v.ratio));
        const avgScore = violations.reduce((sum, v) => sum + v.score, 0) / violations.length;
        
        const summaryHtml = `
            <div style="background: #374151; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                <strong>Contrast Analysis Results</strong><br>
                <div style="margin-top: 8px;">
                    � Low-contrast regions: ${violations.length}<br>
                    ⚠️ Worst ratio: ${worstRatio.toFixed(2)}:1<br>
                    📊 Average severity: ${avgScore.toFixed(2)}<br>
                    🎯 Block size: 16×16 pixels
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
        if (ratio >= 3.0) return 0;
        if (ratio <= 1.0) return 1.0;
        
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
            compliant: ratio >= 3.0
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
                
                if (!regionResult.compliant) {
                    results.push({
                        ...regionResult,
                        x,
                        y,
                    });
                }
            }
        }
        return results; // Return all violations, no limit
    }
});
