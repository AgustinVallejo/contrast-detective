import React, { useRef, useEffect, useMemo } from 'react';
import { AnalysisResult } from '../types';
import { ANALYSIS_BLOCK_SIZE } from '../constants';
import { SpinnerIcon } from './icons';

interface AnalysisDisplayProps {
    imageUrl: string;
    results: AnalysisResult[] | null;
    isLoading: boolean;
    onReset: () => void;
    contrastThreshold: number;
    onThresholdChange: (value: number) => void;
}

// =============================================================================
// Non-Linear Slider Mapping
// =============================================================================
const MIN_CONTRAST = 1.0;
const MAX_CONTRAST = 4.5;
const SLIDER_MAX = 100; // Use a 0-100 scale for the input element for smooth mapping
const CURVE_POWER = 2.5; // A higher power gives more sensitivity at the low end

/**
 * Maps a linear slider value (e.g., 0-100) to our non-linear contrast scale.
 * @param sliderValue The raw value from the range input.
 * @returns The corresponding contrast threshold.
 */
const mapSliderValueToThreshold = (sliderValue: number): number => {
    const normalized = sliderValue / SLIDER_MAX;
    const curved = Math.pow(normalized, CURVE_POWER);
    const value = MIN_CONTRAST + curved * (MAX_CONTRAST - MIN_CONTRAST);
    return Math.round(value * 100) / 100; // Round to two decimal places
};

/**
 * Maps a contrast threshold value back to the linear scale for the slider's position.
 * @param threshold The current contrast threshold from state.
 * @returns The corresponding value for the range input.
 */
const mapThresholdToSliderValue = (threshold: number): number => {
    if (threshold <= MIN_CONTRAST) return 0;
    if (threshold >= MAX_CONTRAST) return SLIDER_MAX;
    
    const normalized = (threshold - MIN_CONTRAST) / (MAX_CONTRAST - MIN_CONTRAST);
    const deCurved = Math.pow(normalized, 1 / CURVE_POWER);
    return deCurved * SLIDER_MAX;
};


const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ imageUrl, results, isLoading, onReset, contrastThreshold, onThresholdChange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const filteredResults = useMemo(() => {
        if (!results) return [];
        return results.filter(result => result.ratio < contrastThreshold);
    }, [results, contrastThreshold]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !imageUrl) return;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            if (filteredResults) {
                filteredResults.forEach(result => {
                    const opacity = result.score;
                    ctx.fillStyle = `rgba(255, 20, 147, ${opacity * 0.6 + 0.1})`; // Deep pink, opacity based on score
                    ctx.fillRect(result.x, result.y, ANALYSIS_BLOCK_SIZE, ANALYSIS_BLOCK_SIZE);
                    
                    ctx.strokeStyle = `rgba(255, 20, 147, ${opacity * 0.8 + 0.2})`;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(result.x, result.y, ANALYSIS_BLOCK_SIZE, ANALYSIS_BLOCK_SIZE);
                });
            }
        };
        img.src = imageUrl;
    }, [imageUrl, filteredResults]);

    const nonCompliantCount = filteredResults.length;

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const sliderValue = parseFloat(e.target.value);
        const newThreshold = mapSliderValueToThreshold(sliderValue);
        onThresholdChange(newThreshold);
    };

    return (
        <div className="w-full flex flex-col items-center gap-6">
            <div className="w-full max-w-5xl bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                    <h2 className="text-lg font-bold text-white">Analysis Results</h2>
                     <p className={`text-base ${nonCompliantCount > 0 ? 'text-pink-400' : 'text-green-400'}`}>
                        {isLoading ? 'Analyzing...' : `Found ${nonCompliantCount} low-contrast regions below threshold.`}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                     <div className="flex items-center gap-3">
                        <label htmlFor="threshold-slider" className="text-slate-300 text-sm whitespace-nowrap">Threshold</label>
                        <input
                            id="threshold-slider"
                            type="range"
                            min="0"
                            max={SLIDER_MAX}
                            step="1"
                            value={mapThresholdToSliderValue(contrastThreshold)}
                            onChange={handleSliderChange}
                            className="w-32 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            aria-label="Contrast violation threshold"
                        />
                        <span className="text-cyan-400 font-mono text-sm w-16 text-center bg-slate-700/50 rounded-md px-1">{contrastThreshold.toFixed(2)}:1</span>
                     </div>
                    <button 
                        onClick={onReset}
                        className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                        Analyze New Page
                    </button>
                </div>
            </div>
            
            <div className="relative w-full max-w-7xl overflow-auto border-2 border-slate-700 rounded-lg bg-black">
                {isLoading && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
                        <SpinnerIcon className="w-16 h-16 text-cyan-400" />
                        <p className="text-lg text-slate-200 mt-4">Detecting contrast issues...</p>
                    </div>
                )}
                <canvas ref={canvasRef} className="max-w-full h-auto mx-auto block" />
            </div>
        </div>
    );
};

export default AnalysisDisplay;