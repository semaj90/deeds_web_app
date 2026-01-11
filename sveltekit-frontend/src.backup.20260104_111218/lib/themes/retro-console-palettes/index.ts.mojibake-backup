export type ConsolePalette = 'legal' | 'dark' | 'light' | 'retro' | 'cyberpunk'; // Extend with more palettes as needed

export function applyConsolePalette(palette: ConsolePalette): void {
  const root = document.documentElement;

  // Define CSS variables for each palette
  switch (palette) {
    case 'legal':
      root.style.setProperty('--console-bg', '#0f0f23');
      root.style.setProperty('--console-fg', '#e0e0e0');
      root.style.setProperty('--console-primary', '#00aa00');
      root.style.setProperty('--console-primary-light', '#00cc00');
      root.style.setProperty('--console-bg-light', '#1a1a2e');
      root.style.setProperty(
        '--console-gradient-main',
        'linear-gradient(135deg, #0f0f23, #1a1a2e)'
      );
      root.style.setProperty(
        '--console-gradient-footer',
        'linear-gradient(45deg, #0f0f23, #1a1a2e)'
      );
      root.style.setProperty('--console-font', "'Inter', sans-serif");
      break;
    case 'dark':
      root.style.setProperty('--console-bg', '#121212');
      root.style.setProperty('--console-fg', '#ffffff');
      root.style.setProperty('--console-primary', '#bb86fc');
      root.style.setProperty('--console-primary-light', '#d0aaff');
      root.style.setProperty('--console-bg-light', '#1e1e1e');
      root.style.setProperty(
        '--console-gradient-main',
        'linear-gradient(135deg, #121212, #1e1e1e)'
      );
      root.style.setProperty(
        '--console-gradient-footer',
        'linear-gradient(45deg, #121212, #1e1e1e)'
      );
      root.style.setProperty('--console-font', "'Inter', sans-serif");
      break;
    case 'light':
      root.style.setProperty('--console-bg', '#f0f0f0');
      root.style.setProperty('--console-fg', '#333333');
      root.style.setProperty('--console-primary', '#007bff');
      root.style.setProperty('--console-primary-light', '#0056b3');
      root.style.setProperty('--console-bg-light', '#e0e0e0');
      root.style.setProperty(
        '--console-gradient-main',
        'linear-gradient(135deg, #f0f0f0, #e0e0e0)'
      );
      root.style.setProperty(
        '--console-gradient-footer',
        'linear-gradient(45deg, #f0f0f0, #e0e0e0)'
      );
      root.style.setProperty('--console-font', "'Inter', sans-serif");
      break;
    case 'retro':
      root.style.setProperty('--console-bg', '#000080');
      root.style.setProperty('--console-fg', '#c0c0c0');
      root.style.setProperty('--console-primary', '#00ff00');
      root.style.setProperty('--console-primary-light', '#00cc00');
      root.style.setProperty('--console-bg-light', '#000060');
      root.style.setProperty(
        '--console-gradient-main',
        'linear-gradient(135deg, #000080, #000060)'
      );
      root.style.setProperty(
        '--console-gradient-footer',
        'linear-gradient(45deg, #000080, #000060)'
      );
      root.style.setProperty('--console-font', "'Press Start 2P', cursive");
      break;
    case 'cyberpunk':
      root.style.setProperty('--console-bg', '#0a0a0a');
      root.style.setProperty('--console-fg', '#00ffff');
      root.style.setProperty('--console-primary', '#ff00ff');
      root.style.setProperty('--console-primary-light', '#cc00cc');
      root.style.setProperty('--console-bg-light', '#1a0a1a');
      root.style.setProperty(
        '--console-gradient-main',
        'linear-gradient(135deg, #0a0a0a, #1a0a1a)'
      );
      root.style.setProperty(
        '--console-gradient-footer',
        'linear-gradient(45deg, #0a0a0a, #1a0a1a)'
      );
      root.style.setProperty('--console-font', "'Orbitron', sans-serif");
      break;
    default:
      applyConsolePalette('legal'); // Fallback
      break;
  }
}
