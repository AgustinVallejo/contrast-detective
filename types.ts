
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface AnalysisResult {
  score: number;
  ratio: number;
  colors: RGBColor[];
  compliant: boolean;
  x: number;
  y: number;
}
