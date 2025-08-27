
import React, { useState, useCallback, useEffect } from 'react';
import { AnalysisResult } from './types';
import { gridAnalysis } from './services/contrastAnalyzer';
import { ANALYSIS_BLOCK_SIZE } from './constants';
import Header from './components/Header';
import AnalysisDisplay from './components/AnalysisDisplay';
import { CameraIcon, SpinnerIcon } from './components/icons';

const App: React.FC = () => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [results, setResults] = useState<AnalysisResult[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [contrastThreshold, setContrastThreshold] = useState<number>(3.0);

    const handleReset = () => {
        setImageUrl(null);
        setResults(null);
        setError(null);
    };

    const analyzeImage = useCallback(async (url: string): Promise<AnalysisResult[]> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const analysisResults = gridAnalysis(imageData, ANALYSIS_BLOCK_SIZE);
                resolve(analysisResults);
            };
            img.onerror = (err) => reject(new Error(`Failed to load image for analysis. ${err.toString()}`));
            img.src = url;
        });
    }, []);

    const handleCapture = useCallback(async () => {
        if (typeof chrome === 'undefined' || !chrome.tabs) {
            setError("This feature requires the Chrome Extension environment.");
            return;
        }
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error("Could not identify active tab.");

            setIsLoading(true);
            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
            setImageUrl(dataUrl); // This will trigger the analysis useEffect
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred while capturing the tab.');
            console.error(e);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!imageUrl) {
            setResults(null);
            return;
        }

        const performAnalysis = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const analysisResults = await analyzeImage(imageUrl);
                setResults(analysisResults);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred during analysis.');
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        performAnalysis();
    }, [imageUrl, analyzeImage]);

    return (
        <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 md:p-8 bg-slate-900">
            <Header />
            <main className="w-full max-w-7xl flex-grow flex flex-col items-center justify-center mt-8">
                {error && (
                    <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg mb-6 w-full max-w-2xl text-center">
                        <p className="font-bold">An Error Occurred</p>
                        <p>{error}</p>
                    </div>
                )}
                {!imageUrl ? (
                    <div className="w-full max-w-2xl mx-auto p-10 sm:p-16 border-2 border-dashed rounded-2xl border-slate-600 flex flex-col items-center justify-center text-center">
                        <CameraIcon className="w-16 h-16 mb-4 text-slate-500" />
                        <p className="text-xl font-semibold text-slate-300">
                            Ready to investigate?
                        </p>
                        <p className="text-slate-400 mt-2">Capture the current tab to begin analysis.</p>
                        <button 
                            onClick={handleCapture}
                            disabled={isLoading}
                            className="mt-8 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <SpinnerIcon className="w-5 h-5" />
                                    <span>Capturing...</span>
                                </>
                            ) : 'Analyze Page'}
                        </button>
                    </div>
                ) : (
                    <AnalysisDisplay 
                        imageUrl={imageUrl}
                        results={results}
                        isLoading={isLoading}
                        onReset={handleReset}
                        contrastThreshold={contrastThreshold}
                        onThresholdChange={setContrastThreshold}
                    />
                )}
            </main>
             <footer className="text-center py-6 text-slate-500 text-sm">
                <p>Contrast Detective - A tool for better web accessibility.</p>
            </footer>
        </div>
    );
};

export default App;
