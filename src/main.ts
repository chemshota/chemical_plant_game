import './ui/style.css';
import { loadSavedGame, onBoardRedraw, onPanelRender, refresh } from './ui/app';
import { renderFlowWindow } from './ui/flow';
import { initInput } from './ui/input';
import { initPanels, renderPanels, showHelp } from './ui/panels';
import { drawBoard, initRenderer } from './ui/renderer';

// ============================================================
// 初期化
// ============================================================

const canvas = document.getElementById('board') as HTMLCanvasElement;
initRenderer(canvas);
initInput(canvas);
initPanels();
onBoardRedraw(drawBoard);
onPanelRender(renderPanels);
onPanelRender(renderFlowWindow);

const resumed = loadSavedGame();
refresh();
if (!resumed) showHelp();
