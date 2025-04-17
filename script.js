document.addEventListener('DOMContentLoaded', () => {
    const desktop = document.getElementById('desktop');
    const taskbarClockTime = document.getElementById('clock-time');
    const taskbarClockDate = document.getElementById('clock-date');
    const windowContainer = document.getElementById('window-container');
    const windowTemplate = document.getElementById('window-template');
    const startButton = document.getElementById('start-button');
    const startMenu = document.getElementById('start-menu');
    const trayArrow = document.getElementById('tray-arrow');
    const trayFlyout = document.getElementById('tray-flyout');
    const minimizedWindowsContainer = document.getElementById('minimized-windows');
    const taskbar = document.getElementById('taskbar'); // Get taskbar element

    let highestZIndex = 10;
    let openWindows = {}; // Track window elements, state, bounds etc.
    const TASKBAR_HEIGHT = 48; // Define taskbar height constant

    // --- Clock Update ---
    function updateClock() {
        const now = new Date();
        const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
        const dateOptions = { month: 'numeric', day: 'numeric', year: 'numeric' }; // Short date
        taskbarClockTime.textContent = now.toLocaleTimeString('en-US', timeOptions);
        taskbarClockDate.textContent = now.toLocaleDateString('en-US', dateOptions);
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- Generic Popup Toggle & Click Outside ---
    function setupPopup(triggerElement, popupElement) {
        triggerElement.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from immediately closing via document listener
            const isActive = popupElement.classList.toggle('active');
            // Optional: Close other popups when one opens
             if (isActive) {
                 if (popupElement === startMenu) trayFlyout.classList.remove('active');
                 if (popupElement === trayFlyout) startMenu.classList.remove('active');
             }
        });
    }

    function handleClickOutside(event) {
        // Close Start Menu if click is outside
        if (startMenu.classList.contains('active') && !startMenu.contains(event.target) && event.target !== startButton && !startButton.contains(event.target)) {
            startMenu.classList.remove('active');
        }
        // Close Tray Flyout if click is outside
        if (trayFlyout.classList.contains('active') && !trayFlyout.contains(event.target) && event.target !== trayArrow && !trayArrow.contains(event.target)) {
            trayFlyout.classList.remove('active');
        }
    }

    document.addEventListener('click', handleClickOutside);

    setupPopup(startButton, startMenu);
    setupPopup(trayArrow, trayFlyout);


    // --- Bring Window to Front ---
    function bringToFront(windowId) {
        if (!openWindows[windowId] || openWindows[windowId].state === 'minimized') return; // Don't bring minimized windows to front visually

        highestZIndex++;
        openWindows[windowId].element.style.zIndex = highestZIndex;
        openWindows[windowId].element.focus(); // Focus the window element

        // Update active state for taskbar buttons
        document.querySelectorAll('.minimized-btn.active').forEach(btn => btn.classList.remove('active'));
        if (openWindows[windowId].taskbarButton) {
            openWindows[windowId].taskbarButton.classList.add('active');
        }
    }

     // --- Taskbar Minimized Button Management ---
    function createMinimizedTaskbarItem(id, title, iconSrc) {
        const button = document.createElement('button');
        button.className = 'minimized-btn';
        button.dataset.windowId = id;
        button.title = title;

        const img = document.createElement('img');
        img.src = iconSrc || 'https://img.icons8.com/fluency/16/window-close.png'; // Default icon
        img.alt = title.substring(0, 3); // Short alt text

        button.appendChild(img);
        // button.appendChild(document.createTextNode(title)); // Optionally add text

        button.addEventListener('click', () => {
            restoreWindow(id);
            bringToFront(id);
        });

        minimizedWindowsContainer.appendChild(button);
        openWindows[id].taskbarButton = button; // Store reference
        button.classList.add('active'); // Mark as active when first minimized/restored
    }

    function removeMinimizedTaskbarItem(id) {
        if (openWindows[id] && openWindows[id].taskbarButton) {
            openWindows[id].taskbarButton.remove();
            delete openWindows[id].taskbarButton;
        }
         // If closing the last window, maybe reset active state on pinned icons? (Optional)
    }

    // --- Window State Management ---
    function minimizeWindow(id) {
        const win = openWindows[id];
        if (!win || win.state === 'minimized') return;

        win.state = 'minimized';
        win.element.classList.add('minimized');
        win.element.setAttribute('aria-hidden', 'true');

        if (!win.taskbarButton) { // Create taskbar button if it doesn't exist
             createMinimizedTaskbarItem(id, win.title, win.icon);
        } else {
             win.taskbarButton.classList.remove('active'); // Deactivate visually if minimizing an active window
        }

        // Focus next available window or desktop (complex logic, omitted for brevity)
        // Find the highest z-index non-minimized window and bring it to front
        let topWinId = null;
        let maxZ = 0;
        for (const winId in openWindows) {
            if (openWindows[winId].state !== 'minimized' && parseInt(openWindows[winId].element.style.zIndex) > maxZ) {
                maxZ = parseInt(openWindows[winId].element.style.zIndex);
                topWinId = winId;
            }
        }
        if (topWinId) {
            bringToFront(topWinId);
        }
    }

    function maximizeWindow(id) {
        const win = openWindows[id];
        if (!win || win.state === 'maximized' || win.state === 'minimized') return;

        win.state = 'maximized';
        // Store original position and size *before* maximizing
        win.originalBounds = {
            top: win.element.offsetTop,
            left: win.element.offsetLeft,
            width: win.element.offsetWidth,
            height: win.element.offsetHeight
        };

        win.element.classList.add('maximized');
        win.element.style.top = `0px`; // Position at top-left of container
        win.element.style.left = `0px`;
        win.element.style.width = `${windowContainer.offsetWidth}px`; // Full container width
        win.element.style.height = `${windowContainer.offsetHeight}px`; // Full container height

        // Change maximize icon to restore icon
        const maxRestoreBtn = win.element.querySelector('.win-maximize-restore i');
        maxRestoreBtn.classList.remove('fa-square');
        maxRestoreBtn.classList.add('fa-window-restore'); // Use FA restore icon class
        maxRestoreBtn.parentElement.title = "Restore"; // Update tooltip
        bringToFront(id); // Ensure it's on top
    }

    function restoreWindow(id) {
        const win = openWindows[id];
        if (!win) return;

        // Restore from Minimized
        if (win.state === 'minimized') {
            win.state = 'normal'; // Or 'maximized' if it was maximized before minimizing? (Keep simple for now)
            win.element.classList.remove('minimized');
            win.element.setAttribute('aria-hidden', 'false');
             // If multiple windows are minimized, this brings the specific one back
             if (win.taskbarButton) {
                 win.taskbarButton.classList.add('active');
             }
             bringToFront(id); // Bring it visually to front
        }
        // Restore from Maximized
        else if (win.state === 'maximized') {
            win.state = 'normal';
            win.element.classList.remove('maximized');

            // Restore original size and position
            if (win.originalBounds) {
                win.element.style.top = `${win.originalBounds.top}px`;
                win.element.style.left = `${win.originalBounds.left}px`;
                win.element.style.width = `${win.originalBounds.width}px`;
                win.element.style.height = `${win.originalBounds.height}px`;
            }

            // Change restore icon back to maximize icon
            const maxRestoreBtn = win.element.querySelector('.win-maximize-restore i');
            maxRestoreBtn.classList.add('fa-square');
            maxRestoreBtn.classList.remove('fa-window-restore');
            maxRestoreBtn.parentElement.title = "Maximize"; // Update tooltip
            bringToFront(id); // Ensure it's focused
        } else {
             // If already normal, just bring to front
             bringToFront(id);
        }
    }


    function closeWindow(id) {
        const win = openWindows[id];
        if (!win) return;

        // Optional: Add fade-out animation before removing
        win.element.style.opacity = '0';
        win.element.style.transform = 'scale(0.95)';

        setTimeout(() => {
            win.element.remove();
            removeMinimizedTaskbarItem(id); // Remove taskbar button if exists
            delete openWindows[id];

            // Optional: Bring next highest window to front after closing
             let topWinId = null;
             let maxZ = 0;
             for (const winId in openWindows) {
                 if (openWindows[winId].state !== 'minimized' && parseInt(openWindows[winId].element.style.zIndex) > maxZ) {
                     maxZ = parseInt(openWindows[winId].element.style.zIndex);
                     topWinId = winId;
                 }
             }
             if (topWinId) {
                 bringToFront(topWinId);
             }

        }, 150); // Delay matches CSS transition
    }


    // --- Window Dragging (Modified for Maximize state) ---
    function makeDraggable(windowElement, windowId) {
        const titleBar = windowElement.querySelector('.window-titlebar');
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-control')) return; // Ignore clicks on controls
            if (openWindows[windowId]?.state === 'maximized') return; // Don't drag maximized windows

            isDragging = true;
            dragOffsetX = e.clientX - windowElement.offsetLeft;
            dragOffsetY = e.clientY - windowElement.offsetTop;
            windowElement.style.cursor = 'grabbing';
            bringToFront(windowId);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Double-click title bar to maximize/restore
        titleBar.addEventListener('dblclick', (e) => {
             if (e.target.closest('.window-control')) return; // Ignore clicks on controls
             if (openWindows[windowId]?.state === 'maximized') {
                 restoreWindow(windowId);
             } else if (openWindows[windowId]?.state === 'normal') {
                 maximizeWindow(windowId);
             }
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            let newX = e.clientX - dragOffsetX;
            let newY = e.clientY - dragOffsetY;

            // Basic boundary checks (Keep title bar visible)
            const containerRect = windowContainer.getBoundingClientRect();
            newX = Math.max(-windowElement.offsetWidth + 80, Math.min(newX, containerRect.width - 40));
            newY = Math.max(0, Math.min(newY, containerRect.height - titleBar.offsetHeight));

            windowElement.style.left = `${newX}px`;
            windowElement.style.top = `${newY}px`;
        }

        function onMouseUp() {
            if (!isDragging) return;
            isDragging = false;
            windowElement.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

         // Bring to front on click anywhere in window
         windowElement.addEventListener('mousedown', (e) => {
             // Only bring to front if not already the top-most INTERACTIVE window
             if (openWindows[windowId]?.state !== 'minimized') {
                 const currentZ = parseInt(windowElement.style.zIndex || 0);
                 if (currentZ < highestZIndex) {
                     bringToFront(windowId);
                 }
                 // Also activate taskbar button if clicking the window directly
                 document.querySelectorAll('.minimized-btn.active').forEach(btn => btn.classList.remove('active'));
                 if (openWindows[windowId]?.taskbarButton) {
                    openWindows[windowId]?.taskbarButton.classList.add('active');
                 }
             }
         }, true); // Capture phase
    }

    // --- Window Controls Setup ---
    function setupWindowControls(windowElement, windowId) {
        const minimizeButton = windowElement.querySelector('.win-minimize');
        const maximizeRestoreButton = windowElement.querySelector('.win-maximize-restore');
        const closeButton = windowElement.querySelector('.win-close');

        minimizeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            minimizeWindow(windowId);
        });

        maximizeRestoreButton.addEventListener('click', (e) => {
             e.stopPropagation();
            if (openWindows[windowId]?.state === 'maximized') {
                restoreWindow(windowId);
            } else {
                maximizeWindow(windowId);
            }
        });

        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeWindow(windowId);
        });
    }

    // --- Create Window Function (Updated) ---
    function createWindow(id, title, iconSrc, contentHtml, initialWidth = 600, initialHeight = 400) {
        // If window exists and is minimized, restore it
        if (openWindows[id] && openWindows[id].state === 'minimized') {
            restoreWindow(id);
            bringToFront(id);
            return;
        }
        // If window exists and is normal/maximized, just bring to front
        else if (openWindows[id]) {
            bringToFront(id);
            return;
        }

        const windowEl = windowTemplate.content.firstElementChild.cloneNode(true);
        windowEl.id = `window-${id}`;
        windowEl.querySelector('.window-title').textContent = title;
        windowEl.querySelector('.window-icon').src = iconSrc;
        windowEl.querySelector('.window-icon').alt = title;
        windowEl.querySelector('.window-content').innerHTML = contentHtml;

        // Initial Position & Size (slightly randomized)
        const offsetX = Math.floor(Math.random() * 150) + 70;
        const offsetY = Math.floor(Math.random() * 80) + 40;
        windowEl.style.left = `${offsetX}px`;
        windowEl.style.top = `${offsetY}px`;
        windowEl.style.width = `${initialWidth}px`;
        windowEl.style.height = `${initialHeight}px`;

        windowContainer.appendChild(windowEl);

        // Store window info
        openWindows[id] = {
            element: windowEl,
            state: 'normal', // Initial state
            originalBounds: null, // Will be set on first maximize
            taskbarButton: null, // Will be set on first minimize
            title: title,
            icon: iconSrc
        };

        makeDraggable(windowEl, id);
        setupWindowControls(windowEl, id);
        bringToFront(id); // Bring new window to front

         // Create the taskbar item immediately but keep it hidden until minimized?
         // Or create it only ON minimize? Let's stick to ON minimize for now.

         // Focus the new window content if possible (e.g., textarea)
         const focusable = windowEl.querySelector('textarea, input');
         if (focusable) {
             focusable.focus();
         } else {
             windowEl.focus(); // Focus the window div itself
         }
    }

    // --- Content Generation Functions ---
    function createMyComputerContent() {
        // (Same as before - no changes needed here for this example)
        return `
            <div class="file-explorer-content">
                <div class="fe-sidebar">
                    <h4>Favourites</h4><ul><li><i class="fa-solid fa-desktop"></i> Desktop</li><li><i class="fa-solid fa-download"></i> Downloads</li><li><i class="fa-regular fa-file-lines"></i> Documents</li><li><i class="fa-regular fa-image"></i> Pictures</li></ul>
                     <h4>This PC</h4><ul><li class="active"><i class="fa-solid fa-display"></i> This PC</li><li><i class="fa-solid fa-music"></i> Music</li><li><i class="fa-solid fa-video"></i> Videos</li></ul>
                     <h4>Network</h4><ul><li><i class="fa-solid fa-network-wired"></i> Network</li></ul>
                </div>
                <div class="fe-main">
                    <div class="fe-section-title">Devices and drives</div>
                    <div class="fe-items-grid">
                        <div class="fe-item"><i class="fa-solid fa-hard-drive"></i><span>Local Disk (C:)</span></div>
                        <div class="fe-item"><i class="fa-solid fa-compact-disc"></i><span>DVD RW Drive (D:)</span></div>
                         <div class="fe-item"><i class="fa-solid fa-network-wired"></i><span>Network Location</span></div>
                    </div>
                     <div class="fe-section-title" style="margin-top: 20px;">Folders</div>
                     <div class="fe-items-grid">
                         <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Desktop</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Documents</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Downloads</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Music</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Pictures</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Videos</span></div>
                     </div>
                </div>
            </div>
        `;
    }

     function createNotepadContent() {
         return `<textarea class="notepad-content" spellcheck="false"></textarea>`;
     }

     function createRecycleBinContent() {
         return `<div style="padding: 30px; text-align: center; color: #666;">
                    <i class="fas fa-recycle" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Recycle Bin is empty</p>
                 </div>`;
     }


    // --- Desktop Icon Event Listeners ---
    document.querySelectorAll('.desktop-icon').forEach(icon => {
        icon.addEventListener('dblclick', () => {
            const id = icon.id.replace('-icon', ''); // e.g., 'my-computer'
            const title = icon.title;
            const iconUrl = icon.dataset.iconUrl || 'https://img.icons8.com/fluency/16/window-close.png'; // Default small icon
            let content = '';
            let width = 750; // Default width
            let height = 500; // Default height

            switch (id) {
                case 'my-computer':
                    content = createMyComputerContent();
                    width = 850; height = 550;
                    break;
                case 'recycle-bin':
                    content = createRecycleBinContent();
                    width = 500; height = 350;
                    break;
                case 'notepad':
                     content = createNotepadContent();
                     width = 600; height = 450;
                     break;
                // Add cases for other icons
                default:
                    content = `<div style="padding:20px;">Content for ${title}</div>`;
            }

            createWindow(id, title, iconUrl, content, width, height);

            // Deselect other icons
             document.querySelectorAll('.desktop-icon.active-select').forEach(i => i.classList.remove('active-select'));
        });

         // Basic single click selection simulation
         icon.addEventListener('click', (e) => {
             e.stopPropagation(); // Prevent desktop click listener
              document.querySelectorAll('.desktop-icon.active-select').forEach(i => i.classList.remove('active-select'));
             icon.classList.add('active-select');
         });
    });

    // Click on desktop to deselect icons
    desktop.addEventListener('click', () => {
        document.querySelectorAll('.desktop-icon.active-select').forEach(i => i.classList.remove('active-select'));
         // Also close popups if open
         startMenu.classList.remove('active');
         trayFlyout.classList.remove('active');
    });


    // Prevent default drag behavior for icons
    desktop.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('desktop-icon') || e.target.closest('.desktop-icon')) {
            e.preventDefault();
        }
    });

}); // End DOMContentLoaded