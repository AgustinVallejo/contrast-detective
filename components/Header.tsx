
import React from 'react';
import { EyeIcon } from './icons';

const Header: React.FC = () => {
    return (
        <header className="w-full max-w-7xl text-center">
            <div className="flex items-center justify-center gap-4">
                <EyeIcon className="w-12 h-12 text-cyan-400" />
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                    Contrast Detective
                </h1>
            </div>
            <p className="mt-3 text-lg text-slate-400">
                Find and fix accessibility issues in your UI screenshots.
            </p>
        </header>
    );
};

export default Header;
