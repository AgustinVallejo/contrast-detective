
import { RGBColor, AnalysisResult } from '../types';

// =============================================================================
// WCAG Contrast Calculation Functions
// =============================================================================

function sRGBToLinear(component: number): number {
    const c = component / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(r: number, g: number, b: number): number {
    const R = sRGBToLinear(r);
    const G = sRGBToLinear(g);
    const B = sRGBToLinear(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getContrastRatio(rgb1: RGBColor, rgb2: RGBColor): number {
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

function uiContrastViolationScore(ratio: number): number {
    if (ratio >= 3.0) return 0;
    if (ratio <= 1.0) return 1.0;
    
    const t = (ratio - 1.0) / (3.0 - 1.0); // normalize to [0,1]
    return 0.5 * (1 + Math.cos(Math.PI * t)); // Smooth cosine transition
}

// =============================================================================
// Color Analysis Functions
// =============================================================================
function simpleKMeans(colors: RGBColor[], k: number): RGBColor[] {
    if (colors.length <= k) return colors;
    
    let centroids = colors.slice(0, k).map(c => ({...c}));
    
    for (let iteration = 0; iteration < 10; iteration++) {
        const clusters: RGBColor[][] = Array(k).fill(0).map(() => []);
        
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

function extractDominantColors(imageData: ImageData, x: number, y: number, width: number, height: number, maxColors: number = 2): RGBColor[] {
    const data = imageData.data;
    const colors: RGBColor[] = [];
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

function analyzeUIRegion(imageData: ImageData, x: number, y: number, width: number, height: number) {
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


export function gridAnalysis(imageData: ImageData, blockSize: number): AnalysisResult[] {
    const { width, height } = imageData;
    const results: AnalysisResult[] = [];

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
