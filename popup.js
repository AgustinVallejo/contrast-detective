// Chrome extension popup script
document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsDiv = document.getElementById('results');

    analyzeBtn.addEventListener('click', async function() {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
        resultsDiv.innerHTML = '<div class="loading">Analyzing page contrast...</div>';

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Inject and execute the content script
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: analyzePageContrast,
            });

            // Handle both sync and async results
            let violations = results[0].result;
            
            // If result is a Promise, await it
            if (violations && typeof violations.then === 'function') {
                violations = await violations;
            }

            displayResults(violations);
        } catch (error) {
            console.error('Analysis error:', error);
            resultsDiv.innerHTML = '<div class="violation">Error: Could not analyze page. Make sure you\'re on a valid webpage.</div>';
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze Current Page';
        }
    });

    function displayResults(violations) {
        if (!violations || violations.length === 0) {
            resultsDiv.innerHTML = '<div class="no-violations">✅ No contrast violations found!</div>';
            return;
        }

        const violationsHtml = violations.map((violation, index) => `
            <div class="violation">
                <strong>Violation ${index + 1}</strong><br>
                <strong>Contrast Ratio: ${violation.ratio.toFixed(2)}:1</strong> 
                ${violation.ratio < 2.0 ? '🔴' : '🟡'}<br>
                Severity Score: ${violation.score.toFixed(2)}<br>
                Location: (${violation.x}, ${violation.y})<br>
                ${violation.element ? `Element: ${violation.element}<br>` : ''}
                ${violation.colors && violation.colors.length >= 2 ? 
                    `Colors: rgb(${violation.colors[0].r},${violation.colors[0].g},${violation.colors[0].b}) / rgb(${violation.colors[1].r},${violation.colors[1].g},${violation.colors[1].b})` : ''}
            </div>
        `).join('');

        resultsDiv.innerHTML = violationsHtml;
    }
});

// This function will be injected into the page
function analyzePageContrast() {
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
        // If colors are identical, there is no contrast to measure.
        // Return a high value to ensure it passes the compliance check.
        if (rgb1.r === rgb2.r && rgb1.g === rgb2.g && rgb1.b === rgb2.b) {
            return 21;
        }

        const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
        const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
        
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        
        return (lighter + 0.05) / (darker + 0.05);
    }

    // =============================================================================
    // Violation Scoring Functions
    // =============================================================================

    function uiContrastViolationScore(ratio) {
        if (ratio >= 3.0) return 0;
        if (ratio <= 1.0) return 1.0;
        
        const t = (ratio - 1.0) / (3.0 - 1.0); // normalize to [0,1]
        return 0.5 * (1 + Math.cos(Math.PI * t)); // Smooth cosine transition
    }

    // =============================================================================
    // Color Analysis Functions
    // =============================================================================
    
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

    // =============================================================================
    // Main Analysis Pipeline
    // =============================================================================

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
        return results;
    }

    // =============================================================================
    // Page Analysis Implementation
    // =============================================================================

    try {
        // Since we can't use html2canvas in a content script, use DOM-based analysis
        return analyzeDOMElements();
        
    } catch (error) {
        console.error('Analysis error:', error);
        return [];
    }

    // Enhanced DOM-based analysis using the full contrast algorithm
    function analyzeDOMElements() {
        const elements = document.querySelectorAll('*');
        const violations = [];
        const processedElements = new Set();
        
        for (let i = 0; i < Math.min(elements.length, 200); i++) {
            const element = elements[i];
            
            // Skip if already processed or too small
            if (processedElements.has(element)) continue;
            
            const rect = element.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 20) continue;
            
            const styles = window.getComputedStyle(element);
            const bgColor = styles.backgroundColor;
            const textColor = styles.color;
            
            // Skip elements without proper colors
            if (!bgColor || !textColor || 
                bgColor === 'rgba(0, 0, 0, 0)' || 
                bgColor === 'transparent' ||
                textColor === 'rgba(0, 0, 0, 0)') continue;
            
            const bg = parseColor(bgColor);
            const text = parseColor(textColor);
            
            if (bg && text) {
                const ratio = getContrastRatio(bg, text);
                const score = uiContrastViolationScore(ratio);
                
                if (ratio < 3.0) {
                    violations.push({
                        ratio,
                        score,
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        colors: [bg, text],
                        compliant: false,
                        element: element.tagName.toLowerCase()
                    });
                    
                    processedElements.add(element);
                }
            }
        }
        
        // Sort by worst violations first (lowest ratio)
        violations.sort((a, b) => a.ratio - b.ratio);
        return violations.slice(0, 15);
    }

    function parseColor(colorStr) {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return {
                r: parseInt(match[1]),
                g: parseInt(match[2]),
                b: parseInt(match[3])
            };
        }
        return null;
    }
}
