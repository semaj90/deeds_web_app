/**
 * 🎮 Retro Console Color Palettes for Legal AI
 * Authentic color palettes from classic gaming consoles with legal AI integration
 */

export interface ConsolePalette {
    name: string;
	era: string;
    colors: {
	primary: string;
        secondary: string;
	tertiary: string;
        success: string;
	warning: string;
        error: string;
        background: string;
        foreground: string;
	accent: string[];
        evidence: string;
	classification: string;
        confidence: string;
	priority: string;
    };
    gradients: {
	main: string;
        modal: string;
	card: string;
        evidence: string;
	priority: string;
    };
    constraints: {
	maxColors: number;
        bitDepth: number;
	memoryKB: number;
    };
    cssVariables: Record<string, string>;
}

export const NES_PALETTE: ConsolePalette = {
    name: 'NES Classic',
    era: '8-bit',
    colors: {
	primary: '#E52521',
        secondary: '#0084FF',
        tertiary: '#4CAF50',
        success: '#5CB85C',
        warning: '#FFC107',
        error: '#DC3545',
        background: '#000000',
        foreground: '#FCFCFC',
        evidence: '#8B4513',
        classification: '#6B8E23',
        confidence: '#32CD32',
        priority: '#FF6347',
        accent: [
            '#7C7C7C',
            '#0000FC',
            '#BC0000',
            '#BC00BC',
            '#00BC00',
            '#00BCBC',
            '#BCBC00',
            '#BCBCBC',
        ]
    },
	gradients: {
		main: 'linear-gradient(0deg, #000000, #1C1C1C, #383838)',
        modal: 'linear-gradient(135deg, #000000, #0000FC, #000000)',
        card: 'linear-gradient(45deg, #1C1C1C, #383838)',
        evidence: 'linear-gradient(90deg, #8B4513, #CD853F)',
        priority: 'linear-gradient(45deg, #FF6347, #DC3545)'
    },
	constraints: {
		maxColors: 54,
        bitDepth: 2,
        memoryKB: 2
    },
	cssVariables: {
        '--nes-primary': '#E52521',
        '--nes-secondary': '#0084FF',
        '--nes-tertiary': '#4CAF50',
        '--nes-success': '#5CB85C',
        '--nes-warning': '#FFC107',
        '--nes-error': '#DC3545',
        '--nes-background': '#000000',
        '--nes-foreground': '#FCFCFC',
        '--nes-evidence': '#8B4513',
        '--nes-classification': '#6B8E23',
        '--nes-confidence': '#32CD32',
        '--nes-priority': '#FF6347'
    }
};

export const SNES_PALETTE: ConsolePalette = {
    name: 'SNES Mode 7',
    era: '16-bit',
    colors: {
	primary: '#B266FF',
        secondary: '#00C8FF',
        tertiary: '#FFD700',
        success: '#00FF00',
        warning: '#FFAA00',
        error: '#FF0066',
        background: '#1A0033',
        foreground: '#F8F8F8',
        evidence: '#9C88FF',
        classification: '#706FD3',
        confidence: '#00D2D3',
        priority: '#FF5252',
        accent: [
            '#FF6B9D',
            '#C44569',
            '#524A7B',
            '#2D3561',
            '#0E7490',
            '#FFC857',
            '#119DA4',
            '#6A0572',
        ]
    },
	gradients: {
		main: 'linear-gradient(180deg, #1A0033, #524A7B, #B266FF)',
        modal: 'linear-gradient(135deg, #1A0033 0%, #524A7B 50%, #B266FF 100%)',
        card: 'radial-gradient(circle, #524A7B, #1A0033)',
        evidence: 'linear-gradient(135deg, #9C88FF, #706FD3)',
        priority: 'linear-gradient(90deg, #FF5252, #FF0066)'
    },
	constraints: {
		maxColors: 32768,
        bitDepth: 15,
        memoryKB: 128
    },
	cssVariables: {
        '--snes-primary': '#B266FF',
        '--snes-secondary': '#00C8FF',
        '--snes-tertiary': '#FFD700',
        '--snes-success': '#00FF00',
        '--snes-warning': '#FFAA00',
        '--snes-error': '#FF0066',
        '--snes-background': '#1A0033',
        '--snes-foreground': '#F8F8F8',
        '--snes-evidence': '#9C88FF',
        '--snes-classification': '#706FD3',
        '--snes-confidence': '#00D2D3',
        '--snes-priority': '#FF5252'
    }
};

export const PS1_PALETTE: ConsolePalette = {
    name: 'PlayStation Classic',
    era: '32-bit',
    colors: {
	primary: '#003791',
        secondary: '#FF3131',
        tertiary: '#00BF63',
        success: '#00D452',
        warning: '#FFB800',
        error: '#FF1744',
        background: '#0A0E27',
        foreground: '#E7F6F2',
        evidence: '#8B5CF6',
        classification: '#EC4899',
        confidence: '#10B981',
        priority: '#F59E0B',
        accent: [
            '#2196F3',
            '#00BCD4',
            '#009688',
            '#4CAF50',
            '#8BC34A',
            '#CDDC39',
            '#FFC107',
            '#FF5722',
        ]
    },
	gradients: {
		main: 'linear-gradient(90deg, #0A0E27, #003791, #2196F3)',
        modal: 'linear-gradient(135deg, #003791 0%, #2196F3 50%, #00BCD4 100%)',
        card: 'linear-gradient(180deg, #0A0E27, #003791)',
        evidence: 'linear-gradient(45deg, #8B5CF6, #EC4899)',
        priority: 'linear-gradient(90deg, #F59E0B, #FF1744)'
    },
	constraints: {
		maxColors: 16777216,
        bitDepth: 24,
        memoryKB: 2048
    },
	cssVariables: {
        '--ps1-primary': '#003791',
        '--ps1-secondary': '#FF3131',
        '--ps1-tertiary': '#00BF63',
        '--ps1-success': '#00D452',
        '--ps1-warning': '#FFB800',
        '--ps1-error': '#FF1744',
        '--ps1-background': '#0A0E27',
        '--ps1-foreground': '#E7F6F2',
        '--ps1-evidence': '#8B5CF6',
        '--ps1-classification': '#EC4899',
        '--ps1-confidence': '#10B981',
        '--ps1-priority': '#F59E0B'
    }
};

export const N64_PALETTE: ConsolePalette = {
    name: 'N64 Ultra',
    era: '64-bit',
    colors: {
	primary: '#00AA00',
        secondary: '#0055FF',
        tertiary: '#FF5555',
        success: '#00FF00',
        warning: '#FFFF00',
        error: '#FF0000',
        background: '#1E1E1E',
        foreground: '#F0F0F0',
        evidence: '#CD853F',
        classification: '#D2691E',
        confidence: '#32CD32',
        priority: '#FF6347',
        accent: [
            '#AA00FF',
            '#FF00AA',
            '#00AAFF',
            '#FFAA00',
            '#AA5500',
            '#5500AA',
            '#00AA55',
            '#FF55AA',
        ]
    },
	gradients: {
		main: 'linear-gradient(45deg, #1E1E1E, #00AA00, #0055FF, #FF5555)',
        modal: 'conic-gradient(from 180deg, #00AA00, #0055FF, #FF5555, #AA00FF, #00AA00)',
        card: 'linear-gradient(135deg, #1E1E1E, #00AA00, #1E1E1E)',
        evidence: 'linear-gradient(90deg, #CD853F, #D2691E)',
        priority: 'linear-gradient(45deg, #FF6347, #FF0000)'
    },
	constraints: {
		maxColors: 32768,
        bitDepth: 15,
        memoryKB: 4096
    },
	cssVariables: {
        '--n64-primary': '#00AA00',
        '--n64-secondary': '#0055FF',
        '--n64-tertiary': '#FF5555',
        '--n64-success': '#00FF00',
        '--n64-warning': '#FFFF00',
        '--n64-error': '#FF0000',
        '--n64-background': '#1E1E1E',
        '--n64-foreground': '#F0F0F0',
        '--n64-evidence': '#CD853F',
        '--n64-classification': '#D2691E',
        '--n64-confidence': '#32CD32',
        '--n64-priority': '#FF6347'
    }
};

export const PS2_PALETTE: ConsolePalette = {
    name: 'PS2 Emotion',
    era: '128-bit',
    colors: {
	primary: '#1B3A6B',
        secondary: '#3A7BC8',
        tertiary: '#67B3CC',
        success: '#4ECDC4',
        warning: '#F7B731',
        error: '#FC5C65',
        background: '#0C1929',
        foreground: '#DFE6ED',
        evidence: '#A55EEA',
        classification: '#8854D0',
        confidence: '#0FB9B1',
        priority: '#FC5C65',
        accent: [
            '#A55EEA',
            '#8854D0',
            '#3867D6',
            '#2D98DA',
            '#0FB9B1',
            '#20BF6B',
            '#FED330',
            '#FC5C65',
        ]
    },
	gradients: {
		main: 'linear-gradient(120deg, #0C1929, #1B3A6B, #3A7BC8, #67B3CC)',
        modal: 'linear-gradient(45deg, #1B3A6B 0%, #3A7BC8 25%, #67B3CC 50%, #4ECDC4 75%, #A55EEA 100%)',
        card: 'radial-gradient(ellipse at top, #3A7BC8, #1B3A6B, #0C1929)',
        evidence: 'linear-gradient(135deg, #A55EEA, #8854D0)',
        priority: 'linear-gradient(90deg, #FC5C65, #F7B731)'
    },
	constraints: {
		maxColors: 16777216,
        bitDepth: 32,
        memoryKB: 32768
    },
	cssVariables: {
        '--ps2-primary': '#1B3A6B',
        '--ps2-secondary': '#3A7BC8',
        '--ps2-tertiary': '#67B3CC',
        '--ps2-success': '#4ECDC4',
        '--ps2-warning': '#F7B731',
        '--ps2-error': '#FC5C65',
        '--ps2-background': '#0C1929',
        '--ps2-foreground': '#DFE6ED',
        '--ps2-evidence': '#A55EEA',
        '--ps2-classification': '#8854D0',
        '--ps2-confidence': '#0FB9B1',
        '--ps2-priority': '#FC5C65'
    }
};

export const CYBERPUNK_PALETTE: ConsolePalette = {
    name: 'Cyberpunk 2077',
    era: 'Neo-Noir',
    colors: {
	primary: '#00FFFF',
        secondary: '#FF00FF',
        tertiary: '#FFFF00',
        success: '#00FF00',
        warning: '#FFA500',
        error: '#FF0000',
        background: '#0A0A0A',
        foreground: '#E0E0E0',
        evidence: '#9400D3',
        classification: '#FF69B4',
        confidence: '#00CED1',
        priority: '#FF4500',
        accent: [
            '#00FFFF',
            '#FF00FF',
            '#FFFF00',
            '#00FF00',
            '#FFA500',
            '#FF0000',
            '#9400D3',
            '#FF69B4',
        ]
    },
	gradients: {
		main: 'linear-gradient(135deg, #0A0A0A, #00FFFF, #FF00FF)',
        modal: 'linear-gradient(45deg, #0A0A0A 0%, #00FFFF 50%, #FF00FF 100%)',
        card: 'linear-gradient(180deg, #0A0A0A, #1A1A1A)',
        evidence: 'linear-gradient(90deg, #9400D3, #FF69B4)',
        priority: 'linear-gradient(45deg, #FF4500, #FF0000)'
    },
	constraints: {
		maxColors: 16777216,
        bitDepth: 32,
        memoryKB: 131072
    },
	cssVariables: {
        '--cyberpunk-primary': '#00FFFF',
        '--cyberpunk-secondary': '#FF00FF',
        '--cyberpunk-tertiary': '#FFFF00',
        '--cyberpunk-success': '#00FF00',
        '--cyberpunk-warning': '#FFA500',
        '--cyberpunk-error': '#FF0000',
        '--cyberpunk-background': '#0A0A0A',
        '--cyberpunk-foreground': '#E0E0E0',
        '--cyberpunk-evidence': '#9400D3',
        '--cyberpunk-classification': '#FF69B4',
        '--cyberpunk-confidence': '#00CED1',
        '--cyberpunk-priority': '#FF4500'
    }
};

export const LEGAL_AI_PALETTE: ConsolePalette = {
    name: 'Legal AI Professional',
    era: 'Modern',
    colors: {
	primary: '#1E293B',
        secondary: '#334155',
        tertiary: '#00FF88',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        background: '#0F172A',
        foreground: '#F8FAFC',
        evidence: '#8B5CF6',
        classification: '#EC4899',
        confidence: '#10B981',
        priority: '#F59E0B',
        accent: [
            '#06B6D4',
            '#EC4899',
            '#10B981',
            '#F59E0B',
            '#EF4444',
            '#6366F1',
            '#84CC16',
        ]
    },
	gradients: {
		main: 'linear-gradient(135deg, #0F172A, #1E293B, #00FF88)',
        modal: 'linear-gradient(45deg, #1E293B 0%, #334155 50%, #00FF88 100%)',
        card: 'linear-gradient(180deg, #1E293B, #0F172A)',
        evidence: 'linear-gradient(90deg, #8B5CF6, #EC4899)',
        priority: 'linear-gradient(45deg, #F59E0B, #EF4444)'
    },
	constraints: {
		maxColors: 16777216,
        bitDepth: 32,
        memoryKB: 65536
    },
	cssVariables: {
        '--legal-primary': '#1E293B',
        '--legal-secondary': '#334155',
        '--legal-tertiary': '#00FF88',
        '--legal-success': '#10B981',
        '--legal-warning': '#F59E0B',
        '--legal-error': '#EF4444',
        '--legal-background': '#0F172A',
        '--legal-foreground': '#F8FAFC',
        '--legal-evidence': '#8B5CF6',
        '--legal-classification': '#EC4899',
        '--legal-confidence': '#10B981',
        '--legal-priority': '#F59E0B'
    }
};

export const CONSOLE_PALETTES = {
    nes: NES_PALETTE,
    snes: SNES_PALETTE,
    ps1: PS1_PALETTE,
    n64: N64_PALETTE,
    ps2: PS2_PALETTE,
    legal: LEGAL_AI_PALETTE,
    cyberpunk: CYBERPUNK_PALETTE
} as const;

export type ConsolePaletteName = keyof typeof CONSOLE_PALETTES;

export function applyConsolePalette(consoleName: ConsolePaletteName): void {
    if (typeof document === 'undefined') return;
    const palette = CONSOLE_PALETTES[consoleName];
    const root = document.documentElement;

    Object.entries(palette.cssVariables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

export function getConstrainedColor(color: string, bitDepth: number): string {
    if (bitDepth >= 24) return color;

    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const levels = Math.pow(2, bitDepth / 3);
    const step = 255 / (levels - 1);

    const qr = Math.round(Math.round(r / step) * step);
    const qg = Math.round(Math.round(g / step) * step);
    const qb = Math.round(Math.round(b / step) * step);

    return `#${qr.toString(16).padStart(2, '0')}${qg.toString(16).padStart(2, '0')}${qb.toString(16).padStart(2, '0')}`;
}

export function generateConstrainedGradient(colors: string[], memoryKB: number, angle: number = 45): string {
    const maxStops = Math.min(colors.length, Math.floor(memoryKB / 8));
    const selectedColors = colors.slice(0, maxStops);
    return `linear-gradient(${angle}deg, ${selectedColors.join(', ')})`;
}

export function getCurrentPalette(): ConsolePalette {
    if (typeof localStorage === 'undefined') return CONSOLE_PALETTES.legal;
    const stored = localStorage.getItem('console-palette') as ConsolePaletteName;
    return CONSOLE_PALETTES[stored] || CONSOLE_PALETTES.legal;
}

export function getPaletteNames(): ConsolePaletteName[] {
    return Object.keys(CONSOLE_PALETTES) as ConsolePaletteName[];
}

export function getPalette(name: ConsolePaletteName): ConsolePalette {
    return CONSOLE_PALETTES[name];
}

export function createThemeCSS(paletteName: ConsolePaletteName): string {
    const palette = CONSOLE_PALETTES[paletteName];
    return `
    /* ${palette.name} - ${palette.era} Theme */
    :root.theme-${paletteName} {
        ${Object.entries(palette.cssVariables)
            .map(([key, value]) => `${key}: ${value};`)
            .join('\n        ')}

        /* Generic console variables */
        --console-primary: ${palette.colors.primary};
        --console-secondary: ${palette.colors.secondary};
        --console-tertiary: ${palette.colors.tertiary};
        --console-success: ${palette.colors.success};
        --console-warning: ${palette.colors.warning};
        --console-error: ${palette.colors.error};
        --console-bg: ${palette.colors.background};
        --console-fg: ${palette.colors.foreground};
        --console-evidence: ${palette.colors.evidence};
        --console-classification: ${palette.colors.classification};
        --console-confidence: ${palette.colors.confidence};
        --console-priority: ${palette.colors.priority};

        /* Gradients */
        --console-gradient-main: ${palette.gradients.main};
        --console-gradient-modal: ${palette.gradients.modal};
        --console-gradient-card: ${palette.gradients.card};
        --console-gradient-evidence: ${palette.gradients.evidence};
        --console-gradient-priority: ${palette.gradients.priority};

        /* Accent colors */
        ${palette.colors.accent.map((color, index) => `--console-accent-${index}: ${color};`).join('\n        ')}
    }
    `;
}
