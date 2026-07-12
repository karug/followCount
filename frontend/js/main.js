import Dashboard from './components/Dashboard.js';
let dashboard = null;
window.addEventListener('DOMContentLoaded', bootstrap);
async function bootstrap() { try { dashboard = new Dashboard(); await dashboard.start(); console.info('followCount started successfully.'); } catch (error) { console.error('Unable to start followCount.', error); showFatalError(error); } }
function showFatalError(error) { const app = document.getElementById('app'); app.innerHTML = ''; const container = document.createElement('div'); container.className = 'fatal-error'; const title = document.createElement('h1'); title.textContent = 'followCount'; const subtitle = document.createElement('p'); subtitle.textContent = 'Application startup failed.'; const detail = document.createElement('pre'); detail.textContent = error?.message ?? 'Unknown error'; container.appendChild(title); container.appendChild(subtitle); container.appendChild(detail); app.appendChild(container); }
