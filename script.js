document.addEventListener("DOMContentLoaded", () => {
    const desktop = document.getElementById("desktop");
    const taskbarClockTime = document.getElementById("clock-time");
    const taskbarClockDate = document.getElementById("clock-date");
    const windowContainer = document.getElementById("window-container");
    const windowTemplate = document.getElementById("window-template");
    const startButton = document.getElementById("start-button");
    const startMenu = document.getElementById("start-menu");
    const startSearchInput = document.getElementById("start-search-input");
    const trayArrow = document.getElementById("tray-arrow");
    const trayFlyout = document.getElementById("tray-flyout");
    const minimizedWindowsContainer = document.getElementById("minimized-windows");
    const taskbar = document.getElementById("taskbar");
    const contextMenu = document.getElementById("context-menu");
    const snapHint = document.getElementById("snap-hint");
    const loadingIndicator = document.getElementById("loading-indicator");
    const widgetsButton = document.getElementById("widgets-button");
    const widgetsPanel = document.getElementById("widgets-panel");
    const taskViewButton = document.getElementById("taskview-button");
    const taskView = document.getElementById("task-view");
    const taskViewGrid = document.getElementById("task-view-grid");
    const closeTaskViewButton = document.getElementById("close-task-view");

    let openWindows = {};
    let highestZIndex = 10;
    let nextWindowId = 1;
    let nextDesktopItemId = 1000;
    let activeWindowId = null;
    let draggedIcon = null;
    let dragIconOffsetX = 0;
    let dragIconOffsetY = 0;
    let initialIconPositioningDone = false; // Flag to ensure initial positioning runs only once if needed

    const TASKBAR_HEIGHT = 48;
    const WINDOW_SNAP_MARGIN = 10;
    const WINDOW_SNAP_THRESHOLD = 50;

    // --- State Management (localStorage) ---
    const SAVE_STATE_KEY = 'win11SimulationState_v2'; // Use new key to avoid conflicts with old state

    function saveState() {
        try {
            const state = {
                windows: {},
                desktopIcons: {},
                nextWindowId: nextWindowId,
                nextDesktopItemId: nextDesktopItemId,
                highestZIndex: highestZIndex,
                wallpaper: desktop.style.backgroundImage,
                accentColor: document.documentElement.style.getPropertyValue('--accent-color') || '#0078d4'
            };

            // Save open window states
            for (const id in openWindows) {
                const win = openWindows[id];
                if (win.element && document.body.contains(win.element)) { // Ensure window element exists and is in DOM
                    const style = win.element.style;
                    state.windows[id] = {
                        id: win.id,
                        title: win.title,
                        icon: win.icon,
                        contentGenerator: win.contentGenerator,
                        state: win.state,
                        zIndex: parseInt(style.zIndex || 10),
                        left: style.left || '0px',
                        top: style.top || '0px',
                        width: style.width || '600px',
                        height: style.height || '400px',
                        originalBounds: win.originalBounds,
                        content: null,
                        appType: win.appType
                    };
                    // Specific content saving
                    if (win.appType === 'notepad') {
                        const textarea = win.element.querySelector('.notepad-content');
                        state.windows[id].content = textarea ? textarea.value : '';
                    }
                }
            }

            // Save desktop icon positions
            document.querySelectorAll('.desktop-icon').forEach(icon => {
                if (icon.id && document.body.contains(icon)) { // Ensure icon has ID and is in DOM
                    state.desktopIcons[icon.id] = {
                        left: icon.style.left, // Store actual style value
                        top: icon.style.top,   // Store actual style value
                        title: icon.title,
                        iconUrl: icon.dataset.iconUrl || icon.querySelector('img')?.src,
                        dynamic: icon.classList.contains('dynamic-item'),
                        spanText: icon.querySelector('span').textContent
                    };
                }
            });

            localStorage.setItem(SAVE_STATE_KEY, JSON.stringify(state));
        } catch (error) {
            console.error("Error saving state:", error);
        }
    }

    function loadState() {
        hidePopups();
        try {
            const savedStateString = localStorage.getItem(SAVE_STATE_KEY);
            if (!savedStateString) {
                console.log("No saved state found. Applying defaults.");
                applyWallpaper('url("wallpaper.jpg")');
                applyTheme('#0078d4');
                positionInitialIcons(); // Arrange default icons nicely
                initialIconPositioningDone = true; // Mark as done
                return;
            }

            const state = JSON.parse(savedStateString);

            // Restore settings
            nextWindowId = state.nextWindowId || 1;
            nextDesktopItemId = state.nextDesktopItemId || 1000;
            highestZIndex = state.highestZIndex || 10;
            applyWallpaper(state.wallpaper || 'url("wallpaper.jpg")');
            applyTheme(state.accentColor || '#0078d4');

            // --- Restore Desktop Icons ---
            const currentIcons = {};
            let hasSavedIconPositions = false;
            document.querySelectorAll('.desktop-icon').forEach(icon => currentIcons[icon.id] = icon);

            // Position existing/default icons and add dynamic ones
            for (const id in state.desktopIcons) {
                const iconState = state.desktopIcons[id];
                let iconElement = document.getElementById(id);

                if (!iconElement && iconState.dynamic) {
                    iconElement = createDesktopIcon(id, iconState.title, iconState.spanText, iconState.iconUrl, true);
                }

                if (iconElement) {
                    // *** Correction: Only apply saved position if it's explicitly set ***
                    if (iconState.left && iconState.top) {
                        iconElement.style.left = iconState.left;
                        iconElement.style.top = iconState.top;
                        hasSavedIconPositions = true; // Mark that we found saved positions
                    }
                    currentIcons[id] = null; // Mark as processed
                }
            }

            // *** Correction: If NO saved positions were applied, run the default positioning ***
            if (!hasSavedIconPositions) {
                console.log("No saved icon positions found, applying default layout.");
                positionInitialIcons();
            }
            initialIconPositioningDone = true; // Positioning handled one way or another


            // --- Restore Windows ---
            windowContainer.innerHTML = '';
            minimizedWindowsContainer.innerHTML = '';
            openWindows = {};

            const sortedWindowIds = Object.keys(state.windows).sort((a, b) => {
                return (state.windows[a].zIndex || 0) - (state.windows[b].zIndex || 0);
            });

            for (const id of sortedWindowIds) {
                const winState = state.windows[id];
                 // Check if generator exists OR if it's a generic type handled elsewhere
                 if (winState && (windowContentGenerators[winState.contentGenerator] || winState.appType === 'generic' || winState.appType === 'folder')) {
                    let contentHtml = '';
                    if (windowContentGenerators[winState.contentGenerator]) {
                        contentHtml = windowContentGenerators[winState.contentGenerator]();
                    } else {
                        // Handle generic/folder types if no specific generator
                        contentHtml = `<div style="padding:20px;">Content for ${winState.title}</div>`;
                    }

                    let savedContentForApp = (winState.appType === 'notepad') ? winState.content : null;

                     createWindow(
                        winState.id,
                        winState.title,
                        winState.icon,
                        contentHtml,
                        parseInt(winState.width) || 600, // Provide defaults
                        parseInt(winState.height) || 400,
                        winState.left,
                        winState.top,
                        winState.contentGenerator,
                        winState.appType,
                        savedContentForApp
                     );

                    // Restore state (minimized, maximized) and zIndex
                    const newWin = openWindows[winState.id];
                    if (newWin) {
                        newWin.element.style.zIndex = winState.zIndex;
                        newWin.originalBounds = winState.originalBounds;

                        // *** Apply state AFTER window creation ***
                        if (winState.state === 'minimized') {
                            // Temporarily set state to normal before minimizing to ensure taskbar item creation
                            newWin.state = 'normal';
                            minimizeWindow(winState.id, true); // skip state save during load
                        } else if (winState.state === 'maximized') {
                             // Temporarily set state to normal before maximizing
                             newWin.state = 'normal';
                             maximizeWindow(winState.id, true); // skip state save during load
                        } else {
                            // It's 'normal' or 'snapped', ensure taskbar button exists
                            newWin.state = winState.state || 'normal'; // Keep snapped state if saved
                             if (!newWin.taskbarButton) {
                                newWin.taskbarButton = createMinimizedTaskbarItem(winState.id, winState.title, winState.icon);
                            }
                             // Ensure correct maximize/restore icon for snapped windows on load
                             if (newWin.state.startsWith('snapped')) {
                                 const maxRestoreBtnIcon = newWin.element.querySelector(".win-maximize-restore i");
                                 if (maxRestoreBtnIcon) {
                                     maxRestoreBtnIcon.classList.remove("fa-restore-icon");
                                     maxRestoreBtnIcon.classList.add("fa-maximize-icon");
                                     maxRestoreBtnIcon.parentElement.title = "Maximize";
                                 }
                                 newWin.element.style.resize = 'none'; // Disable resize
                             }
                        }
                    }
                } else {
                     console.warn(`Content generator "${winState.contentGenerator}" not found for window ID "${id}". Skipping window restoration.`);
                 }
            }
            // Bring the highest z-index window to front visually if needed
            let topWinId = null;
            let maxZ = 0;
            for (const id in openWindows) {
                if (openWindows[id].state !== 'minimized' && openWindows[id].element) {
                    const z = parseInt(openWindows[id].element.style.zIndex || 0);
                    if (z >= maxZ) {
                        maxZ = z;
                        topWinId = id;
                    }
                }
            }
            if (topWinId) {
                bringToFront(topWinId);
            } else {
                document.querySelectorAll('.minimized-btn.active').forEach(btn => btn.classList.remove('active'));
            }

            console.log("State loaded.");

        } catch (error) {
            console.error("Error loading state:", error);
            localStorage.removeItem(SAVE_STATE_KEY); // Clear potentially corrupted state
            // Apply defaults after clearing bad state
             applyWallpaper('url("wallpaper.jpg")');
             applyTheme('#0078d4');
            positionInitialIcons();
            initialIconPositioningDone = true;
        }
    }

    // --- Clock ---
    function updateClock() {
        const now = new Date();
        const timeOptions = { hour: "numeric", minute: "2-digit", hour12: true };
        const dateOptions = { month: "numeric", day: "numeric", year: "numeric" };
        taskbarClockTime.textContent = now.toLocaleTimeString("en-US", timeOptions);
        taskbarClockDate.textContent = now.toLocaleDateString("en-US", dateOptions);

        const widgetClock = document.getElementById('widget-clock');
        if (widgetsPanel.classList.contains('active') && widgetClock) {
            widgetClock.textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
        }
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- Popup Handling ---
    function hidePopups(except = null) {
        const popups = [startMenu, trayFlyout, widgetsPanel, contextMenu, taskView];
        popups.forEach(popup => {
            if (popup && popup !== except) {
                if (popup.classList.contains('active')) {
                    popup.classList.remove('active');
                    // Special handling for elements using display none/block
                    if (popup === contextMenu || popup === taskView) {
                        popup.style.display = 'none';
                    }
                } else if (popup.style.display === 'block' && (popup === contextMenu || popup === taskView)) {
                     // Handle cases where only display was set (e.g. context menu)
                     popup.style.display = 'none';
                 }
            }
        });
    }


    function setupPopup(triggerElement, popupElement, isContextMenu = false) {
        if (!triggerElement || !popupElement) return;

        triggerElement.addEventListener("click", (event) => {
            event.stopPropagation();
            const isActive = popupElement.classList.contains("active"); // Check before toggle

            if (!isActive) {
                hidePopups(popupElement); // Hide others FIRST
                popupElement.classList.add("active"); // Then show the target

                // Positioning logic
                if (popupElement === trayFlyout) {
                    const triggerRect = triggerElement.getBoundingClientRect();
                    popupElement.style.right = `${document.documentElement.clientWidth - triggerRect.right}px`;
                    popupElement.style.bottom = `${TASKBAR_HEIGHT + 7}px`;
                } else if (popupElement === widgetsPanel) {
                    popupElement.style.left = `10px`;
                    popupElement.style.bottom = `${TASKBAR_HEIGHT + 7}px`;
                } else if (popupElement === taskView) {
                    toggleTaskView(true); // Use specific handler
                     popupElement.style.display = 'block'; // Ensure display is block
                }
                // Start menu uses CSS transform
                // Context menu position is handled in its own show function

            } else {
                popupElement.classList.remove("active"); // Just hide if already active
                if (popupElement === taskView) {
                     toggleTaskView(false);
                     // Add transitionend listener for display none
                     popupElement.addEventListener('transitionend', () => {
                         if (!popupElement.classList.contains('active')) {
                            popupElement.style.display = 'none';
                         }
                     }, { once: true });
                 }
                 if (popupElement === contextMenu) { // Ensure context menu is hidden
                    popupElement.style.display = 'none';
                 }
            }
        });
    }


    document.addEventListener("click", (event) => {
        // Improved logic for closing popups on outside click
        if (!event.target.closest('#start-menu') && !event.target.closest('#start-button')) {
            startMenu.classList.remove('active');
        }
        if (!event.target.closest('#tray-flyout') && !event.target.closest('#tray-arrow')) {
            trayFlyout.classList.remove('active');
        }
        if (!event.target.closest('#widgets-panel') && !event.target.closest('#widgets-button')) {
            widgetsPanel.classList.remove('active');
        }
        if (!event.target.closest('#context-menu')) { // Context menu specific check
            hideContextMenu();
        }
         if (taskView.classList.contains('active') && !event.target.closest('#task-view') && !event.target.closest('#taskview-button')) {
            toggleTaskView(false);
              taskView.addEventListener('transitionend', () => {
                 if (!taskView.classList.contains('active')) {
                     taskView.style.display = 'none';
                 }
             }, { once: true });
        }

        // Deselect desktop icons
        if (!event.target.closest('.desktop-icon') && !event.target.closest('#context-menu') && !event.target.closest('.window')) {
             // Check if the click was directly on the desktop or window container
             if (event.target === desktop || event.target === windowContainer) {
                 deselectAllDesktopIcons();
             }
        }
    });


    setupPopup(startButton, startMenu);
    setupPopup(trayArrow, trayFlyout);
    setupPopup(widgetsButton, widgetsPanel);
    setupPopup(taskViewButton, taskView); // Task View uses click to toggle

    if (closeTaskViewButton) {
        closeTaskViewButton.addEventListener('click', () => {
             toggleTaskView(false);
             taskView.addEventListener('transitionend', () => {
                 if (!taskView.classList.contains('active')) {
                    taskView.style.display = 'none';
                 }
             }, { once: true });
         });
    }

    // --- Start Menu Search ---
    if (startSearchInput) {
        startSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const apps = startMenu.querySelectorAll('.start-app-grid .start-app-icon');
            apps.forEach(app => {
                const appName = app.title.toLowerCase();
                const spanText = app.querySelector('span').textContent.toLowerCase();
                const isMatch = searchTerm === '' || appName.includes(searchTerm) || spanText.includes(searchTerm);
                app.classList.toggle('hidden', !isMatch);
            });
        });
    }

    // --- Task View ---
     function toggleTaskView(show) {
         if (show) {
            // Hide popups is handled by setupPopup now
             taskViewGrid.innerHTML = ''; // Clear previous thumbnails
             let hasOpenWindows = false;
             // Sort windows by z-index descending for display order
            const sortedWindows = Object.values(openWindows)
                .filter(win => win.element && win.state !== 'minimized') // Ensure element exists
                .sort((a, b) => (parseInt(b.element.style.zIndex) || 0) - (parseInt(a.element.style.zIndex) || 0));

            sortedWindows.forEach(win => {
                 hasOpenWindows = true;
                 const thumb = document.createElement('div');
                 thumb.className = 'task-view-thumbnail';
                 thumb.dataset.windowId = win.id;
                 thumb.innerHTML = `
                     <div class="task-view-titlebar">
                         <img src="${win.icon}" alt="">
                         <span>${win.title}</span>
                     </div>
                     <div class="task-view-content-preview">
                         <i class="fa-solid fa-display"></i> <!-- Placeholder -->
                     </div>
                 `;
                 thumb.addEventListener('click', () => {
                     // No need to restore if not minimized
                     bringToFront(win.id);
                     toggleTaskView(false); // Close task view after selection
                      taskView.addEventListener('transitionend', () => {
                         if (!taskView.classList.contains('active')) {
                             taskView.style.display = 'none';
                         }
                     }, { once: true });
                 });
                 taskViewGrid.appendChild(thumb);
             });

             if (!hasOpenWindows) {
                 taskViewGrid.innerHTML = '<p style="color: #ccc; grid-column: 1 / -1; text-align: center;">No open windows</p>';
             }

             // taskView.style.display = 'block'; // display handled by setupPopup
             // Force reflow to allow transition
             void taskView.offsetWidth;
             // taskView.classList.add('active'); // Handled by setupPopup

         } else {
             // taskView.classList.remove('active'); // Handled by setupPopup
             // Use transition end event to set display none for accessibility
             // Handled by setupPopup and outside click listener
         }
     }

    // --- Window Management ---
    function bringToFront(windowId) {
        if (!openWindows[windowId] || !openWindows[windowId].element) return;
        const win = openWindows[windowId];

        if (win.state === "minimized") {
            // If trying to bring a minimized window to front, restore it first
            restoreWindow(windowId); // Restore handles bringing to front
            return;
        }

        highestZIndex++;
        win.element.style.zIndex = highestZIndex;
        win.element.focus();
        activeWindowId = windowId;

        document.querySelectorAll('.minimized-btn.active').forEach(btn => btn.classList.remove('active'));
        if (win.taskbarButton) {
            win.taskbarButton.classList.add('active');
        }

        saveState();
    }

    function createMinimizedTaskbarItem(id, title, iconSrc) {
        // Check if button already exists in DOM to prevent duplicates
        if (minimizedWindowsContainer.querySelector(`.minimized-btn[data-window-id="${id}"]`)) {
             // If it exists, ensure the reference in openWindows is correct
            if (openWindows[id] && !openWindows[id].taskbarButton) {
                 openWindows[id].taskbarButton = minimizedWindowsContainer.querySelector(`.minimized-btn[data-window-id="${id}"]`);
            }
            return openWindows[id]?.taskbarButton; // Return existing button or null
        }


        const button = document.createElement("button");
        button.className = "minimized-btn";
        button.dataset.windowId = id;
        button.title = title;

        const img = document.createElement("img");
        img.src = iconSrc || "https://img.icons8.com/fluency/16/window-close.png";
        img.alt = title.substring(0, 3);

        button.appendChild(img);

        button.addEventListener("click", () => {
            const currentWin = openWindows[id];
            if (!currentWin || !currentWin.element) return;

            if (currentWin.state === "minimized") {
                restoreWindow(id); // This will also bring to front
            } else {
                // If it's the currently active window, minimize it
                 if (activeWindowId === id) {
                    minimizeWindow(id);
                } else {
                    // Otherwise, bring it to front
                    bringToFront(id);
                }
            }
        });

        minimizedWindowsContainer.appendChild(button);
        if (openWindows[id]) {
            openWindows[id].taskbarButton = button;
        }
        return button;
    }

    // ######################################################
    // ## START UPDATED removeMinimizedTaskbarItem FUNCTION ##
    // ######################################################
    function removeMinimizedTaskbarItem(id) {
        // 1. Try removing using the stored reference (if it exists and is in DOM)
        if (openWindows[id]?.taskbarButton && document.body.contains(openWindows[id].taskbarButton)) {
            try {
                openWindows[id].taskbarButton.remove();
                // console.log(`Removed taskbar button for ${id} via reference.`);
            } catch (e) {
                 console.error(`Error removing taskbar button via reference for ${id}:`, e);
             }
        }
        // Clear the reference regardless of success above
        if (openWindows[id]) {
             openWindows[id].taskbarButton = null;
        }

        // 2. **Robustness:** Explicitly find and remove ANY button for this ID in the DOM
        // Query within the specific container for minimized buttons
        const buttonInDom = minimizedWindowsContainer.querySelector(`.minimized-btn[data-window-id="${id}"]`);
        if (buttonInDom) {
             try {
                buttonInDom.remove();
                // console.log(`Removed taskbar button for ${id} via direct DOM query.`);
             } catch (e) {
                 console.error(`Error removing taskbar button via DOM query for ${id}:`, e);
             }
        } else {
            // console.log(`No taskbar button found in DOM for ${id} during removal attempt.`);
        }


        // 3. Update active button state for remaining windows
        let topWinId = null;
        let maxZ = 0;
        for (const winId in openWindows) {
            const win = openWindows[winId];
            // Check if the window object and its element still exist after potential closure
             // Ensure the window ID is not the one we are currently removing
             if (winId !== id && win && win.element && document.body.contains(win.element) && win.state !== 'minimized') {
                const z = parseInt(win.element.style.zIndex || 0);
                if (z >= maxZ) { // Use >= to handle single window case
                    maxZ = z;
                    topWinId = winId;
                }
            }
        }

        // Deactivate all buttons first
         document.querySelectorAll('.minimized-btn.active').forEach(btn => btn.classList.remove('active'));

        // Activate the button for the new top window (if any)
         if (topWinId && openWindows[topWinId]?.taskbarButton) {
            openWindows[topWinId].taskbarButton.classList.add('active');
             activeWindowId = topWinId; // Update active window ID
         } else if (!topWinId) { // Check if NO window became top
             // If no other non-minimized windows, clear activeWindowId
             if (!Object.values(openWindows).some(w => w.id !== id && w.state !== 'minimized')) {
                 activeWindowId = null;
             }
         }
    }
    // ####################################################
    // ## END UPDATED removeMinimizedTaskbarItem FUNCTION ##
    // ####################################################


    function minimizeWindow(id, skipStateSave = false) {
        const win = openWindows[id];
        if (!win || win.state === "minimized" || !win.element) return;

        const wasActive = (activeWindowId === id);
        win.state = "minimized";
        win.element.classList.add("minimized");
        win.element.setAttribute("aria-hidden", "true");

        // *** Correction: Assume button exists, just manage its state ***
        // Ensure taskbar button exists (it should have been created by createWindow)
         if (!win.taskbarButton) {
             console.warn(`Taskbar button missing for window ${id} during minimize. Attempting creation.`);
             // Attempt to create it now if it's missing (shouldn't happen often)
             win.taskbarButton = createMinimizedTaskbarItem(id, win.title, win.icon);
         }

        if (win.taskbarButton) {
            win.taskbarButton.classList.remove("active");
        }

        activeWindowId = null; // Clear active window ID temporarily

        // Bring the next highest window to front ONLY if the minimized window WAS the active one
        if (wasActive) {
            let topWinId = null;
            let maxZ = 0;
            for (const winId in openWindows) {
                if (winId !== id && openWindows[winId].state !== "minimized" && openWindows[winId].element) { // Exclude the window being minimized
                    const z = parseInt(openWindows[winId].element.style.zIndex || 0);
                    if (z > maxZ) { // Find strictly highest *other* window
                        maxZ = z;
                        topWinId = winId;
                    }
                }
            }
            if (topWinId) {
                bringToFront(topWinId); // This will set the new activeWindowId and taskbar button
            }
        }


        if (!skipStateSave) saveState();
    }

    function maximizeWindow(id, skipStateSave = false) {
        const win = openWindows[id];
        if (!win || win.state === "maximized" || win.state === "minimized" || !win.element) return;

        if (win.state === "normal" || win.state === "snapped-left" || win.state === "snapped-right") { // Store bounds if coming from normal/snapped state
            win.originalBounds = {
                top: win.element.offsetTop,
                left: win.element.offsetLeft,
                width: win.element.offsetWidth,
                height: win.element.offsetHeight,
            };
        }

        win.state = "maximized";
        win.element.classList.remove("snapped-left", "snapped-right"); // Remove snap classes if any
        win.element.classList.add("maximized");

        // Styles applied by CSS class .maximized take precedence (incl. !important)
        win.element.style.top = `0px`;
        win.element.style.left = `0px`;
        win.element.style.width = `100%`;
        win.element.style.height = `100%`;

        const maxRestoreBtnIcon = win.element.querySelector(".win-maximize-restore i");
        if (maxRestoreBtnIcon) {
            maxRestoreBtnIcon.classList.remove("fa-maximize-icon");
            maxRestoreBtnIcon.classList.add("fa-restore-icon");
            maxRestoreBtnIcon.parentElement.title = "Restore";
        }
        win.element.style.resize = 'none';

        if (!skipStateSave) {
             bringToFront(id);
             saveState();
         }
    }

    function restoreWindow(id, skipStateSave = false) {
        const win = openWindows[id];
        if (!win || !win.element) return;

        const wasMinimized = win.state === "minimized";
        const wasMaximized = win.state === "maximized";

        win.element.classList.remove("minimized", "maximized", "snapped-left", "snapped-right");
        win.element.setAttribute("aria-hidden", "false");
        win.element.style.resize = 'both';

        win.state = "normal"; // Set state to normal after removing classes

        if (wasMaximized && win.originalBounds) {
            win.element.style.top = `${win.originalBounds.top}px`;
            win.element.style.left = `${win.originalBounds.left}px`;
            win.element.style.width = `${win.originalBounds.width}px`;
            win.element.style.height = `${win.originalBounds.height}px`;
        } else if (wasMaximized) {
            win.element.style.width = '70%';
            win.element.style.height = '60%';
            win.element.style.top = '15%';
            win.element.style.left = '15%';
        }

        const maxRestoreBtnIcon = win.element.querySelector(".win-maximize-restore i");
        if (maxRestoreBtnIcon) {
            maxRestoreBtnIcon.classList.remove("fa-restore-icon");
            maxRestoreBtnIcon.classList.add("fa-maximize-icon");
            maxRestoreBtnIcon.parentElement.title = "Maximize";
        }

        if (!win.taskbarButton) {
            win.taskbarButton = createMinimizedTaskbarItem(id, win.title, win.icon);
        }
        if (win.taskbarButton) {
            document.querySelectorAll('.minimized-btn.active').forEach(btn => btn.classList.remove('active'));
            win.taskbarButton.classList.add('active');
        }

         bringToFront(id);

        if (!skipStateSave) saveState();
    }


    function closeWindow(id) {
        const win = openWindows[id];
        if (!win || !win.element) return;

        win.element.style.opacity = "0";
        win.element.style.transform = "scale(0.95)";

        let closed = false;
        const handleTransitionEnd = () => {
            if (closed) return;
            closed = true;
             win.element.removeEventListener('transitionend', handleTransitionEnd); // Clean up listener

            const wasActive = (activeWindowId === id);
             // Remove element first
             if (win.element && document.body.contains(win.element)) {
                win.element.remove();
            }
             // Then remove taskbar item
             removeMinimizedTaskbarItem(id); // Use the updated robust function
             // Then delete reference
             delete openWindows[id];

             activeWindowId = null; // Reset active window temporarily

            // Activate the next top window only if the closed one was active
            if (wasActive) {
                let topWinId = null;
                let maxZ = 0;
                for (const winId in openWindows) { // Iterate remaining windows
                    const currentWin = openWindows[winId];
                     // Check element exists and is not minimized
                     if (currentWin.element && document.body.contains(currentWin.element) && currentWin.state !== "minimized") {
                        const z = parseInt(currentWin.element.style.zIndex || 0);
                        if (z >= maxZ) { // Find highest or equal Z index
                            maxZ = z;
                            topWinId = winId;
                        }
                    }
                }
                 if (topWinId) {
                    bringToFront(topWinId); // This will set activeWindowId and button state
                }
             }
             saveState(); // Save state after closing
         };

        win.element.addEventListener('transitionend', handleTransitionEnd);

        // Fallback timeout in case transitionend doesn't fire (e.g., element removed too quickly)
         setTimeout(() => {
             if (!closed) {
                 console.warn(`Transitionend event did not fire for closing window ${id}. Forcing cleanup.`);
                 handleTransitionEnd(); // Force cleanup
             }
         }, 300); // Adjust timeout duration as needed (slightly longer than transition)
    }

    // --- makeDraggableResizable, setupWindowControls --- (Keep as is from previous corrected version)
     function makeDraggableResizable(windowElement, windowId) {
        const titleBar = windowElement.querySelector(".window-titlebar");
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let isResizing = false;
        let resizeEdge = null;
        let startX, startY, startWidth, startHeight, startLeft, startTop;

        // --- Dragging Logic ---
        titleBar.addEventListener("mousedown", (e) => {
            if (e.target.closest(".window-control") || openWindows[windowId]?.state === "maximized") {
                return;
            }
            if (getResizeEdge(e, windowElement)) {
                 return;
             }

            isDragging = true;
            dragOffsetX = e.clientX - windowElement.offsetLeft;
            dragOffsetY = e.clientY - windowElement.offsetTop;
            windowElement.style.cursor = "grabbing";
            titleBar.style.cursor = "grabbing";
            bringToFront(windowId);
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });

        titleBar.addEventListener("dblclick", (e) => {
            if (e.target.closest(".window-control")) return;
            if (openWindows[windowId]?.state === "maximized") {
                restoreWindow(windowId);
            } else if (openWindows[windowId]?.state === "normal" || openWindows[windowId]?.state.startsWith("snapped")) {
                 maximizeWindow(windowId);
            }
        });

        function onMouseMove(e) {
             if (isResizing) {
                 handleResize(e);
                 return;
             }
            if (!isDragging) return;

             // If dragging a snapped window, restore it first
            if (openWindows[windowId]?.state?.startsWith("snapped")) {
                 restoreWindow(windowId); // Restore to original size/pos before dragging
                 // Recalculate offset based on restored position
                 // This might cause a slight jump, but is necessary for smooth dragging from snapped state
                 dragOffsetX = e.clientX - windowElement.offsetLeft;
                 dragOffsetY = e.clientY - windowElement.offsetTop;
             }

            let newX = e.clientX - dragOffsetX;
            let newY = e.clientY - dragOffsetY;

            const containerRect = windowContainer.getBoundingClientRect();

            // --- Snapping Logic ---
            let snapSide = null;
            snapHint.style.display = 'none';

            if (e.clientY < WINDOW_SNAP_MARGIN) {
                snapSide = 'top';
                snapHint.style.top = `0px`;
                snapHint.style.left = `0px`;
                snapHint.style.width = `${containerRect.width}px`;
                snapHint.style.height = `${containerRect.height}px`;
                snapHint.style.display = 'block';
             } else if (e.clientX < WINDOW_SNAP_MARGIN) {
                snapSide = 'left';
                 snapHint.style.top = `0px`;
                 snapHint.style.left = `0px`;
                 snapHint.style.width = `${containerRect.width / 2}px`;
                 snapHint.style.height = `${containerRect.height}px`;
                 snapHint.style.display = 'block';
             } else if (e.clientX > window.innerWidth - WINDOW_SNAP_MARGIN) {
                 snapSide = 'right';
                 snapHint.style.top = `0px`;
                 snapHint.style.left = `${containerRect.width / 2}px`;
                 snapHint.style.width = `${containerRect.width / 2}px`;
                 snapHint.style.height = `${containerRect.height}px`;
                 snapHint.style.display = 'block';
             }
             windowElement.dataset.snapSide = snapSide || '';

            // --- Boundary checks ---
            const minX = -windowElement.offsetWidth + 80;
            const maxX = containerRect.width - 40;
            const minY = 0;
            const maxY = containerRect.height - titleBar.offsetHeight;

            newX = Math.max(minX, Math.min(newX, maxX));
            newY = Math.max(minY, Math.min(newY, maxY));

            windowElement.style.left = `${newX}px`;
            windowElement.style.top = `${newY}px`;
        }

        function onMouseUp(e) {
             if (isResizing) {
                isResizing = false;
                windowElement.classList.remove('resizing');
                 windowElement.style.cursor = 'default'; // Reset cursor
                document.removeEventListener("mousemove", handleResize);
                document.removeEventListener("mouseup", onMouseUp);
                 saveState();
                return;
             }
            if (!isDragging) return;

            isDragging = false;
            windowElement.style.cursor = "default"; // Reset element cursor
            titleBar.style.cursor = "grab"; // Reset titlebar cursor
            snapHint.style.display = 'none';
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);

            // --- Apply Snapping on Mouse Up ---
            const snapTarget = windowElement.dataset.snapSide;
            const releaseY = e.clientY;
            const releaseX = e.clientX;
            const containerRect = windowContainer.getBoundingClientRect();

             let snapped = false;
            if (snapTarget === 'top' && releaseY < WINDOW_SNAP_THRESHOLD) {
                 maximizeWindow(windowId); // Maximize handles state and appearance
                 snapped = true; // Maximize counts as a snap action completion
            } else if (snapTarget === 'left' && releaseX < WINDOW_SNAP_THRESHOLD) {
                 // Store original bounds before snapping (if not already maximized)
                 if (openWindows[windowId].state !== 'maximized') {
                     openWindows[windowId].originalBounds = {
                         top: windowElement.offsetTop, left: windowElement.offsetLeft,
                         width: windowElement.offsetWidth, height: windowElement.offsetHeight
                     };
                 }
                 windowElement.style.top = '0px';
                 windowElement.style.left = '0px';
                 windowElement.style.width = '50%';
                 windowElement.style.height = '100%';
                 openWindows[windowId].state = 'snapped-left';
                 windowElement.classList.add('snapped-left'); // Add class for potential styling
                 windowElement.style.resize = 'none'; // Disable resize when snapped
                 snapped = true;
            } else if (snapTarget === 'right' && releaseX > window.innerWidth - WINDOW_SNAP_THRESHOLD) {
                 if (openWindows[windowId].state !== 'maximized') {
                      openWindows[windowId].originalBounds = {
                         top: windowElement.offsetTop, left: windowElement.offsetLeft,
                         width: windowElement.offsetWidth, height: windowElement.offsetHeight
                     };
                 }
                 windowElement.style.top = '0px';
                 windowElement.style.left = '50%';
                 windowElement.style.width = '50%';
                 windowElement.style.height = '100%';
                 openWindows[windowId].state = 'snapped-right';
                 windowElement.classList.add('snapped-right'); // Add class for potential styling
                 windowElement.style.resize = 'none';
                 snapped = true;
            }

             // Ensure maximize icon is correct if snapped but not maximized
             if (snapped && openWindows[windowId].state !== 'maximized') {
                 const maxRestoreBtnIcon = windowElement.querySelector(".win-maximize-restore i");
                 if (maxRestoreBtnIcon) {
                     maxRestoreBtnIcon.classList.remove("fa-restore-icon");
                     maxRestoreBtnIcon.classList.add("fa-maximize-icon");
                     maxRestoreBtnIcon.parentElement.title = "Maximize";
                 }
             }

             windowElement.dataset.snapSide = '';
             saveState();
        }

         // --- Resizing Logic ---
        const resizeBorderWidth = 8;

        function getResizeEdge(e, el) {
             // No resize for maximized or snapped windows
             if (openWindows[windowId]?.state === 'maximized' || openWindows[windowId]?.state?.startsWith('snapped')) return null;

            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

             const onLeft = x < resizeBorderWidth;
             const onRight = x > rect.width - resizeBorderWidth;
             const onTop = y < resizeBorderWidth;
             const onBottom = y > rect.height - resizeBorderWidth;

             if (onTop && onLeft) return 'nw';
             if (onTop && onRight) return 'ne';
             if (onBottom && onLeft) return 'sw';
             if (onBottom && onRight) return 'se';
             if (onTop) return 'n';
             if (onBottom) return 's';
             if (onLeft) return 'w';
             if (onRight) return 'e';

            return null;
        }

        windowElement.addEventListener('mousemove', (e) => {
             if (isDragging || isResizing) return;
            const edge = getResizeEdge(e, windowElement);
            if (edge) {
                windowElement.style.cursor = `${edge}-resize`;
            } else {
                windowElement.style.cursor = 'default';
            }
        });
        windowElement.addEventListener('mouseleave', () => {
             if (!isResizing) {
                 windowElement.style.cursor = 'default';
             }
         });


        windowElement.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-titlebar') && getResizeEdge(e, windowElement) !== 'n') return;
             if (e.target.closest('.window-control')) return;

             resizeEdge = getResizeEdge(e, windowElement);
             if (resizeEdge) {
                 isResizing = true;
                 startX = e.clientX;
                 startY = e.clientY;
                 startWidth = windowElement.offsetWidth;
                 startHeight = windowElement.offsetHeight;
                 startLeft = windowElement.offsetLeft;
                 startTop = windowElement.offsetTop;
                 windowElement.classList.add('resizing');
                 bringToFront(windowId);
                 document.addEventListener('mousemove', handleResize);
                 document.addEventListener('mouseup', onMouseUp);
             }
         });


         function handleResize(e) {
             if (!isResizing) return;

             const dx = e.clientX - startX;
             const dy = e.clientY - startY;
             let newWidth = startWidth;
             let newHeight = startHeight;
             let newLeft = startLeft;
             let newTop = startTop;

             const minWidth = parseInt(windowElement.style.minWidth) || 200;
             const minHeight = parseInt(windowElement.style.minHeight) || 150;
             const containerRect = windowContainer.getBoundingClientRect();

             if (resizeEdge.includes('e')) newWidth = Math.max(minWidth, startWidth + dx);
             if (resizeEdge.includes('w')) {
                 newWidth = Math.max(minWidth, startWidth - dx);
                 newLeft = startLeft + dx;
                 if (newWidth === minWidth) newLeft = startLeft + startWidth - minWidth;
             }
             if (resizeEdge.includes('s')) newHeight = Math.max(minHeight, startHeight + dy);
             if (resizeEdge.includes('n')) {
                 newHeight = Math.max(minHeight, startHeight - dy);
                 newTop = startTop + dy;
                 if (newHeight === minHeight) newTop = startTop + startHeight - minHeight;
             }

             // Boundary checks
             if (newLeft < -minWidth + 50) {
                 newWidth -= (-minWidth + 50 - newLeft);
                 newLeft = -minWidth + 50;
             }
             if (newTop < 0) {
                 newHeight -= (0 - newTop);
                 newTop = 0;
             }
             if (newLeft + newWidth > containerRect.width + minWidth - 50) {
                 newWidth = containerRect.width + minWidth - 50 - newLeft;
             }
             if (newTop + newHeight > containerRect.height) {
                 newHeight = containerRect.height - newTop;
             }

             windowElement.style.width = `${Math.max(minWidth, newWidth)}px`;
             windowElement.style.height = `${Math.max(minHeight, newHeight)}px`;
             if (resizeEdge.includes('w') || resizeEdge.includes('n')) {
                 windowElement.style.left = `${newLeft}px`;
                 windowElement.style.top = `${newTop}px`;
             }
         }


        // --- Focus Handling ---
        windowElement.addEventListener("mousedown", (e) => {
            if (openWindows[windowId]?.state !== "minimized") {
                const currentZ = parseInt(windowElement.style.zIndex || 0);
                // Bring to front if it's not the active window OR if its z-index isn't the highest
                if (activeWindowId !== windowId || currentZ < highestZIndex) {
                     bringToFront(windowId);
                }
            }
        }, true); // Use capture phase
    }

    function setupWindowControls(windowElement, windowId) {
        const minimizeButton = windowElement.querySelector(".win-minimize");
        const maximizeRestoreButton = windowElement.querySelector(".win-maximize-restore");
        const closeButton = windowElement.querySelector(".win-close");

        minimizeButton?.addEventListener("click", (e) => {
            e.stopPropagation();
            minimizeWindow(windowId);
        });
        maximizeRestoreButton?.addEventListener("click", (e) => {
            e.stopPropagation();
            if (openWindows[windowId]?.state === "maximized") {
                restoreWindow(windowId);
            } else {
                maximizeWindow(windowId);
            }
        });
        closeButton?.addEventListener("click", (e) => {
            e.stopPropagation();
            closeWindow(windowId);
        });
    }

    // --- Loading Indicator ---
    function showLoadingIndicator() {
        loadingIndicator.classList.add('visible');
        setTimeout(() => {
            loadingIndicator.classList.remove('visible');
        }, 150);
    }

    // --- Window Creation (Core Function) ---
    function createWindow(id, title, iconSrc, contentHtml, initialWidth = 600, initialHeight = 400, initialLeft, initialTop, contentGeneratorName, appType, savedContent = null) {

        if (openWindows[id] && openWindows[id].state === "minimized") {
            showLoadingIndicator();
            restoreWindow(id); // Restore handles bringing to front
            return openWindows[id].element;
        } else if (openWindows[id]) {
            bringToFront(id);
            return openWindows[id].element;
        }

        showLoadingIndicator();

        const windowEl = windowTemplate.content.firstElementChild.cloneNode(true);
        const windowId = id || `window-${nextWindowId++}`;
        windowEl.id = windowId;
        windowEl.dataset.appType = appType || 'generic';

        windowEl.querySelector(".window-title").textContent = title;
        const iconEl = windowEl.querySelector(".window-icon");
        iconEl.src = iconSrc || "https://img.icons8.com/fluency/16/window-close.png";
        iconEl.alt = title;
        windowEl.querySelector(".window-content").innerHTML = contentHtml;

        // Add the correct initial maximize/restore icon class
         const maxRestoreIcon = windowEl.querySelector('.win-maximize-restore i');
         if (maxRestoreIcon) {
            maxRestoreIcon.classList.add('fa-maximize-icon'); // Start with maximize icon
         }


        const containerWidth = windowContainer.offsetWidth;
        const containerHeight = windowContainer.offsetHeight;

        const parseValue = (value, relativeTo) => {
            if (typeof value === 'string' && value.endsWith('%')) {
                return (parseFloat(value) / 100) * relativeTo;
            }
             // Handle 'px' suffix
             if (typeof value === 'string' && value.endsWith('px')) {
                 return parseInt(value);
             }
            return parseInt(value) || 0; // Default to 0 if parsing fails
        };

        let left = parseValue(initialLeft, containerWidth);
        let top = parseValue(initialTop, containerHeight);
        let width = parseValue(initialWidth, containerWidth);
        let height = parseValue(initialHeight, containerHeight);

        if (initialLeft === undefined || initialTop === undefined) {
            const offsetX = (Object.keys(openWindows).length * 30) % Math.max(100, (containerWidth - width - 60)) + 70;
            const offsetY = (Object.keys(openWindows).length * 30) % Math.max(100, (containerHeight - height - 60)) + 40;
            left = offsetX;
            top = offsetY;
        }

        // Boundary checks for initial position
        left = Math.max(0, Math.min(left, containerWidth - width));
        top = Math.max(0, Math.min(top, containerHeight - height));
        width = Math.max(250, width); // Ensure min width
        height = Math.max(150, height); // Ensure min height

        windowEl.style.left = `${left}px`;
        windowEl.style.top = `${top}px`;
        windowEl.style.width = `${width}px`;
        windowEl.style.height = `${height}px`;
        windowEl.style.minWidth = '250px';
        windowEl.style.minHeight = '150px';

        windowContainer.appendChild(windowEl);

        openWindows[windowId] = {
            id: windowId,
            element: windowEl,
            state: "normal",
            originalBounds: null,
            taskbarButton: null, // Will be created shortly
            title: title,
            icon: iconSrc,
            contentGenerator: contentGeneratorName,
            appType: appType,
        };

        // Handle specific app initialization
        if (appType === 'notepad') {
            const textarea = windowEl.querySelector('.notepad-content');
            if (textarea) {
                if (savedContent !== null) textarea.value = savedContent;
                textarea.addEventListener('input', saveState); // Save on input
            }
        } else if (appType === 'calculator') {
            setupCalculator(windowEl, windowId);
        } else if (appType === 'settings') {
            setupSettingsApp(windowEl, windowId);
        } else if (appType === 'my-computer') {
            setupFileExplorer(windowEl, windowId);
        }

        makeDraggableResizable(windowEl, windowId);
        setupWindowControls(windowEl, windowId);

        // Create taskbar item *after* adding to openWindows and setting up controls
        openWindows[windowId].taskbarButton = createMinimizedTaskbarItem(windowId, title, iconSrc);

        bringToFront(windowId); // Sets initial z-index and active state (including taskbar button)

        const focusable = windowEl.querySelector("textarea, input[type='text']");
        if (focusable) {
            setTimeout(() => focusable.focus(), 50);
        } else {
            setTimeout(() => windowEl.focus(), 50);
        }

        saveState();
        return windowEl;
    }

    // --- App Content Generators & Setup --- (Keep as is from previous version)
    const windowContentGenerators = {
        createMyComputerContent: () => `<div class="file-explorer-content"><div class="fe-sidebar"><h4>Favourites</h4><ul><li data-location="desktop"><i class="fa-solid fa-desktop"></i> Desktop</li><li data-location="downloads"><i class="fa-solid fa-download"></i> Downloads</li><li data-location="documents"><i class="fa-regular fa-file-lines"></i> Documents</li><li data-location="pictures"><i class="fa-regular fa-image"></i> Pictures</li></ul><h4>This PC</h4><ul><li class="active" data-location="thispc"><i class="fa-solid fa-display"></i> This PC</li><li data-location="music"><i class="fa-solid fa-music"></i> Music</li><li data-location="videos"><i class="fa-solid fa-video"></i> Videos</li></ul><h4>Network</h4><ul><li data-location="network"><i class="fa-solid fa-network-wired"></i> Network</li></ul></div><div class="fe-main"><div class="fe-section-title">Devices and drives (3)</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-solid fa-hard-drive"></i><span>Local Disk (C:)</span></div><div class="fe-item"><i class="fa-solid fa-compact-disc"></i><span>DVD RW Drive (D:)</span></div><div class="fe-item"><i class="fa-solid fa-network-wired"></i><span>Network Drive (Z:)</span></div></div><div class="fe-section-title" style="margin-top: 20px;">Folders (6)</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-solid fa-folder"></i><span>Desktop</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Documents</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Downloads</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Music</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Pictures</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Videos</span></div></div></div></div>`,
        createNotepadContent: () => `<textarea class="notepad-content" spellcheck="false"></textarea>`,
        createRecycleBinContent: () => `<div style="padding: 30px; text-align: center; color: #666;"><i class="fas fa-recycle" style="font-size: 48px; margin-bottom: 15px;"></i><p>Recycle Bin is empty</p></div>`,
        createCalculatorContent: () => `
            <div class="calculator-content">
                <div class="calc-display" id="calc-display-${nextWindowId}">0</div>
                <div class="calc-buttons">
                    <button class="operator">%</button>
                    <button>CE</button>
                    <button>C</button>
                    <button class="operator">/</button>
                    <button>7</button>
                    <button>8</button>
                    <button>9</button>
                    <button class="operator">*</button>
                    <button>4</button>
                    <button>5</button>
                    <button>6</button>
                    <button class="operator">-</button>
                    <button>1</button>
                    <button>2</button>
                    <button>3</button>
                    <button class="operator">+</button>
                    <button>+/-</button>
                    <button>0</button>
                    <button>.</button>
                    <button class="equals">=</button>
                </div>
            </div>`,
         createSettingsContent: () => `
            <div class="settings-content">
                <div class="settings-sidebar">
                     <ul>
                         <li class="active" data-section="personalization"><i class="fa-solid fa-palette"></i> Personalization</li>
                         <li data-section="display"><i class="fa-solid fa-display"></i> Display</li>
                         <li data-section="system"><i class="fa-solid fa-gear"></i> System</li>
                         <li data-section="network"><i class="fa-solid fa-wifi"></i> Network</li>
                     </ul>
                 </div>
                 <div class="settings-main">
                     <div class="settings-section" id="settings-personalization">
                         <h3>Personalization</h3>
                         <div class="settings-option">
                             <label for="wallpaper-url-${nextWindowId}">Background Image URL</label>
                             <input type="text" id="wallpaper-url-${nextWindowId}" placeholder="Enter image URL...">
                             <button id="apply-wallpaper-url-${nextWindowId}" style="padding: 8px 12px; margin-left: 5px; cursor:pointer;">Apply</button>
                             <div style="margin-top: 10px;">Presets:</div>
                             <div class="wallpaper-previews">
                                 <div class="wallpaper-preview" data-url='url("wallpaper.jpg")' style="background-image: url('wallpaper.jpg');"></div>
                                 <div class="wallpaper-preview" data-url='url("wallpaper2.jpg")' style="background-image: url('wallpaper2.jpg');"></div>
                                 <div class="wallpaper-preview" data-url='url("wallpaper3.jpg")' style="background-image: url('wallpaper3.jpg');"></div>
                                 <div class="wallpaper-preview" data-url='url("wallpaper4.jpg")' style="background-image: url('wallpaper4.jpg');"></div>
                             </div>
                         </div>
                         <div class="settings-option">
                             <label for="accent-color-picker-${nextWindowId}">Accent Color</label>
                             <input type="color" id="accent-color-picker-${nextWindowId}" value="#0078d4">
                             <div class="color-swatches">
                                 <div class="color-swatch" data-color="#0078d4" style="background-color: #0078d4;"></div>
                                 <div class="color-swatch" data-color="#ff8c00" style="background-color: #ff8c00;"></div>
                                 <div class="color-swatch" data-color="#e81123" style="background-color: #e81123;"></div>
                                 <div class="color-swatch" data-color="#00b294" style="background-color: #00b294;"></div>
                                 <div class="color-swatch" data-color="#7719aa" style="background-color: #7719aa;"></div>
                                 <div class="color-swatch" data-color="#515c6b" style="background-color: #515c6b;"></div>
                             </div>
                         </div>
                     </div>
                     <div class="settings-section" id="settings-display-${nextWindowId}" style="display: none;">
                         <h3>Display</h3>
                         <p>Display settings simulation (Not fully implemented).</p>
                         <div class="settings-option">
                             <label>Resolution</label>
                             <select>
                                 <option>1920 x 1080 (Recommended)</option>
                                 <option>1600 x 900</option>
                                 <option>1366 x 768</option>
                             </select>
                         </div>
                     </div>
                      <div class="settings-section" id="settings-system-${nextWindowId}" style="display: none;">
                         <h3>System</h3>
                         <p>System settings simulation (Not implemented).</p>
                     </div>
                      <div class="settings-section" id="settings-network-${nextWindowId}" style="display: none;">
                         <h3>Network</h3>
                         <p>Network settings simulation (Not implemented).</p>
                     </div>
                 </div>
             </div>`,
    };

    // --- App Setup Functions --- (Keep as is: setupCalculator, applyTheme, applyWallpaper, setupSettingsApp, setupFileExplorer)
    function setupCalculator(calcWindow, windowId) {
        const display = calcWindow.querySelector('.calc-display');
        const buttons = calcWindow.querySelectorAll('.calc-buttons button');
        let currentInput = '0';
        let previousInput = null;
        let operator = null;
        let shouldResetDisplay = false;

        const updateDisplay = () => {
             display.textContent = currentInput;
             if (currentInput.length > 10) display.style.fontSize = '1.5em';
             else if (currentInput.length > 7) display.style.fontSize = '1.8em';
             else display.style.fontSize = '2em';
         };

        const calculate = () => {
            const prev = parseFloat(previousInput);
            const current = parseFloat(currentInput);
            if (isNaN(prev) || isNaN(current) || operator === null) return; // Add check for operator

            let result;
            switch (operator) {
                case '+': result = prev + current; break;
                case '-': result = prev - current; break;
                case '*': result = prev * current; break;
                case '/': result = current === 0 ? 'Error' : prev / current; break;
                 case '%': result = prev % current; break;
                default: return;
            }
             if (result === 'Error') {
                 currentInput = result;
             } else {
                 currentInput = String(parseFloat(result.toFixed(10)));
            }
             previousInput = null;
            operator = null;
             shouldResetDisplay = true;
        };

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const value = button.textContent;
                const isOperator = button.classList.contains('operator');

                if (isOperator && value !== '+/-') {
                    if (previousInput !== null && operator !== null && !shouldResetDisplay) {
                        calculate();
                        updateDisplay(); // Update display after calculation before setting new operator
                    }
                    if (currentInput !== 'Error') {
                        operator = value;
                        previousInput = currentInput; // Store current value as previous
                        shouldResetDisplay = true;    // Next digit press should reset
                    }
                } else if (!isNaN(parseInt(value))) { // If it's a number
                    if (currentInput === '0' || shouldResetDisplay || currentInput === 'Error') {
                        currentInput = value;
                        shouldResetDisplay = false;
                    } else {
                         currentInput += value;
                    }
                } else if (value === '.') {
                    if (shouldResetDisplay || currentInput === 'Error') {
                        currentInput = '0.';
                        shouldResetDisplay = false;
                    } else if (!currentInput.includes('.')) {
                        currentInput += '.';
                    }
                } else if (value === '+/-') {
                     if (currentInput !== '0' && currentInput !== 'Error') {
                        currentInput = String(parseFloat(currentInput) * -1);
                     }
                } else if (value === 'C') { // Clear All
                    currentInput = '0';
                    previousInput = null;
                    operator = null;
                    shouldResetDisplay = false;
                } else if (value === 'CE') { // Clear Entry
                    currentInput = '0';
                     shouldResetDisplay = false; // Allow starting new number immediately
                } else if (value === '=') {
                     if (previousInput !== null && operator !== null) {
                        calculate();
                    }
                }
                 updateDisplay();
            });
        });
        updateDisplay();
    }

    function applyTheme(color) {
        if (!color) color = '#0078d4'; // Default fallback
        document.documentElement.style.setProperty('--accent-color', color);
        // Update settings UI if open
         Object.values(openWindows).forEach(win => {
             if (win.appType === 'settings' && win.element && document.body.contains(win.element)) {
                 const swatches = win.element.querySelectorAll('.color-swatch');
                 const picker = win.element.querySelector(`#accent-color-picker-${win.id.split('-').pop()}`); // Use unique ID
                 if (picker) picker.value = color;
                 swatches.forEach(sw => {
                     sw.classList.toggle('selected', sw.dataset.color === color);
                 });
             }
         });
        saveState();
    }

    function applyWallpaper(imageUrlCss) {
        if (!imageUrlCss) imageUrlCss = 'url("wallpaper.jpg")'; // Default fallback
        desktop.style.backgroundImage = imageUrlCss;
        // Update settings UI if open
        Object.values(openWindows).forEach(win => {
             if (win.appType === 'settings' && win.element && document.body.contains(win.element)) {
                 const previews = win.element.querySelectorAll('.wallpaper-preview');
                 const urlInput = win.element.querySelector(`#wallpaper-url-${win.id.split('-').pop()}`); // Use unique ID
                 const urlMatch = imageUrlCss.match(/url\("?(.*?)"?\)/);

                 if (urlInput) urlInput.value = urlMatch ? urlMatch[1] : '';
                 previews.forEach(p => {
                     p.classList.toggle('selected', p.dataset.url === imageUrlCss);
                 });
             }
         });
        saveState();
    }

     function setupSettingsApp(settingsWindow, windowId) {
        const baseId = windowId.split('-').pop(); // Get unique part of ID if generated
        const sidebarLinks = settingsWindow.querySelectorAll('.settings-sidebar li');
        const mainSections = settingsWindow.querySelectorAll('.settings-main .settings-section');
        const wallpaperUrlInput = settingsWindow.querySelector(`#wallpaper-url-${baseId}`);
        const applyWallpaperUrlButton = settingsWindow.querySelector(`#apply-wallpaper-url-${baseId}`);
        const wallpaperPreviews = settingsWindow.querySelectorAll('.wallpaper-preview');
        const accentColorPicker = settingsWindow.querySelector(`#accent-color-picker-${baseId}`);
        const colorSwatches = settingsWindow.querySelectorAll('.color-swatch');

        // Sidebar navigation
        sidebarLinks.forEach(link => {
            link.addEventListener('click', () => {
                const targetSectionId = `settings-${link.dataset.section}`; // Base section name
                 // Need to find the section within this specific window instance
                 const targetSection = settingsWindow.querySelector(`.settings-section[id^="${targetSectionId}"]`);

                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                mainSections.forEach(sec => {
                    sec.style.display = (sec === targetSection) ? 'block' : 'none';
                });
            });
        });

        // Wallpaper URL
        if(applyWallpaperUrlButton && wallpaperUrlInput) {
            applyWallpaperUrlButton.addEventListener('click', () => {
                const url = wallpaperUrlInput.value.trim();
                if (url && (url.startsWith('http') || url.startsWith('/') || url.startsWith('data:'))) {
                    applyWallpaper(`url("${url}")`);
                } else {
                    alert("Please enter a valid image URL (starting with http, /, or data:).");
                }
            });
        }
        // Wallpaper Previews
        wallpaperPreviews.forEach(preview => {
            preview.addEventListener('click', () => {
                applyWallpaper(preview.dataset.url);
            });
        });

        // Accent Color Picker
        if (accentColorPicker) {
            accentColorPicker.addEventListener('input', (e) => {
                applyTheme(e.target.value);
            });
        }
        // Color Swatches
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                applyTheme(swatch.dataset.color);
            });
        });

        // Initialize view based on current state
        const currentAccent = document.documentElement.style.getPropertyValue('--accent-color');
        applyTheme(currentAccent); // Set initial state in picker/swatches
        const currentWallpaper = desktop.style.backgroundImage;
        applyWallpaper(currentWallpaper);
    }

     function setupFileExplorer(feWindow, windowId) {
         const sidebarLinks = feWindow.querySelectorAll('.fe-sidebar li');
         const mainContent = feWindow.querySelector('.fe-main');

         const locationContent = {
             thispc: `<div class="fe-section-title">Devices and drives (3)</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-solid fa-hard-drive"></i><span>Local Disk (C:)</span></div><div class="fe-item"><i class="fa-solid fa-compact-disc"></i><span>DVD RW Drive (D:)</span></div><div class="fe-item"><i class="fa-solid fa-network-wired"></i><span>Network Drive (Z:)</span></div></div><div class="fe-section-title" style="margin-top: 20px;">Folders (6)</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-solid fa-folder"></i><span>Desktop</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Documents</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Downloads</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Music</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Pictures</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Videos</span></div></div>`,
             desktop: `<div class="fe-section-title">Desktop Items</div><div class="fe-items-grid" id="fe-desktop-items-${windowId}"></div>`, // Placeholder for dynamic items
             downloads: `<div class="fe-section-title">Downloads</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-regular fa-file-lines"></i><span>setup.exe</span></div><div class="fe-item"><i class="fa-regular fa-file-image"></i><span>image.jpg</span></div></div>`,
             documents: `<div class="fe-section-title">Documents</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-regular fa-file-word"></i><span>Report.docx</span></div></div>`,
             pictures: `<div class="fe-section-title">Pictures</div><div class="fe-items-grid"><p style='color:#666; grid-column: 1 / -1;'>Empty folder</p></div>`,
             music: `<div class="fe-section-title">Music</div><div class="fe-items-grid"><p style='color:#666; grid-column: 1 / -1;'>Empty folder</p></div>`,
             videos: `<div class="fe-section-title">Videos</div><div class="fe-items-grid"><p style='color:#666; grid-column: 1 / -1;'>Empty folder</p></div>`,
             network: `<div class="fe-section-title">Network</div><div class="fe-items-grid"><p style='color:#666; grid-column: 1 / -1;'>Network discovery is off.</p></div>`,
         };

          // Function to populate desktop items in File Explorer
         const populateDesktopItems = (gridId) => {
             const grid = feWindow.querySelector(`#${gridId}`);
             if (!grid) return;
             grid.innerHTML = ''; // Clear previous items
             document.querySelectorAll('#desktop > .desktop-icon').forEach(icon => {
                 const feItem = document.createElement('div');
                 feItem.className = 'fe-item';
                 const img = icon.querySelector('img').cloneNode(true);
                 img.style.width = '32px';
                 img.style.height = '32px';
                 const span = icon.querySelector('span').cloneNode(true);
                 feItem.appendChild(img);
                 feItem.appendChild(span);
                 grid.appendChild(feItem);
             });
         };


         sidebarLinks.forEach(link => {
             link.addEventListener('click', () => {
                 const location = link.dataset.location;
                 if (location && locationContent[location]) {
                     sidebarLinks.forEach(l => l.classList.remove('active'));
                     link.classList.add('active');
                     mainContent.innerHTML = locationContent[location];

                     // If Desktop location, populate its items
                     if (location === 'desktop') {
                         populateDesktopItems(`fe-desktop-items-${windowId}`);
                     }
                 }
             });
         });
     }

    // --- Desktop Icon Interaction ---
    function getAppDetailsFromIcon(iconElement) {
         if (!iconElement || !iconElement.id) return null; // Need an ID
         const id = iconElement.id.replace("-icon", ""); // Use cleaned ID for lookup
         const fullId = iconElement.id; // Keep original full ID if needed
         const title = iconElement.title || iconElement.querySelector('span')?.textContent; // Get title
         const iconUrl = iconElement.dataset.iconUrl || iconElement.querySelector('img')?.src;
         let contentGeneratorName = null;
         let appType = 'generic';
         let width = 600;
         let height = 400;

         // Use the cleaned ID for switch cases
        switch (id) {
            case "my-computer":
                contentGeneratorName = 'createMyComputerContent'; appType = 'my-computer'; width = 850; height = 550; break;
            case "recycle-bin":
                contentGeneratorName = 'createRecycleBinContent'; appType = 'recycle-bin'; width = 500; height = 350; break;
            case "notepad":
                contentGeneratorName = 'createNotepadContent'; appType = 'notepad'; width = 600; height = 450; break;
            case "calculator":
                contentGeneratorName = 'createCalculatorContent'; appType = 'calculator'; width = 350; height = 450; break;
            case "settings":
                contentGeneratorName = 'createSettingsContent'; appType = 'settings'; width = 750; height = 550; break;
            // Handle dynamically created items by checking their class or title perhaps
            default:
                if (iconElement.classList.contains('dynamic-item')) {
                    if (title.toLowerCase().includes('folder')) {
                        contentGeneratorName = 'createMyComputerContent'; appType = 'folder'; width = 700; height = 500; // Open as explorer view
                    } else if (title.toLowerCase().includes('text document')) {
                        contentGeneratorName = 'createNotepadContent'; appType = 'notepad'; width = 600; height = 450; // Open as notepad
                    } else {
                        // Fallback for unknown dynamic items
                        contentGeneratorName = () => `<div style="padding:20px;">Content for ${title}</div>`; appType = 'generic-dynamic';
                    }
                } else {
                    // Fallback for unknown static icons or start menu items without specific handling
                    console.warn(`No specific app details found for icon ID: ${id}. Using generic window.`);
                     contentGeneratorName = () => `<div style="padding:20px;">Content for ${title} (ID: ${id})</div>`; appType = 'generic-unknown';
                 }
                break;
        }
        // Return the original full ID for window creation to ensure uniqueness
        return { id: fullId.replace("-icon", ""), title, iconUrl, contentGeneratorName, width, height, appType };
    }

    function deselectAllDesktopIcons() {
        document.querySelectorAll(".desktop-icon.active-select")
            .forEach((i) => i.classList.remove("active-select"));
    }

    function setupDesktopIconEventListeners(icon) {
        icon.addEventListener("dblclick", () => {
            hideContextMenu(); // Hide context menu on double click
            const details = getAppDetailsFromIcon(icon);
             if (details) { // Check if details were found
                let content = '';
                // Check if generator is a function name (string) or function object
                if (typeof details.contentGeneratorName === 'string' && windowContentGenerators[details.contentGeneratorName]) {
                    content = windowContentGenerators[details.contentGeneratorName]();
                } else if (typeof details.contentGeneratorName === 'function') {
                     content = details.contentGeneratorName(); // Execute the function directly
                     details.contentGeneratorName = null; // Can't save the function itself easily
                 } else {
                     console.error("Invalid content generator for:", details.title);
                     content = `<div style="padding:20px; color:red;">Error loading content for ${details.title}</div>`;
                 }

                createWindow(
                    details.id, // Use the specific ID from details
                    details.title,
                    details.iconUrl,
                    content,
                    details.width,
                    details.height,
                    undefined, undefined, // Default position
                    details.contentGeneratorName, // Pass name (string) or null
                    details.appType
                );
            }
            deselectAllDesktopIcons();
        });

        icon.addEventListener("click", (e) => {
            e.stopPropagation();
            hideContextMenu();
            if (!e.ctrlKey && !e.shiftKey) {
                deselectAllDesktopIcons();
            }
            icon.classList.add("active-select");
        });

        // Drag and Drop Listeners
        icon.addEventListener('dragstart', (e) => {
             // Allow dragging only from the icon element itself or its direct children (img, span)
            if (e.target === icon || icon.contains(e.target)) {
                draggedIcon = icon; // Use the icon element as the dragged target
                const rect = draggedIcon.getBoundingClientRect();
                dragIconOffsetX = e.clientX - rect.left;
                dragIconOffsetY = e.clientY - rect.top;
                e.dataTransfer.effectAllowed = 'move';
                 try { // Setting data can fail in some contexts
                    e.dataTransfer.setData('text/plain', draggedIcon.id);
                 } catch (err) {}
                setTimeout(() => draggedIcon?.classList.add('dragging'), 0); // Use optional chaining
            } else {
                 e.preventDefault(); // Prevent dragging if started elsewhere
             }
        });

        icon.addEventListener('dragend', (e) => {
             if (draggedIcon) {
                draggedIcon.classList.remove('dragging');
            }
             draggedIcon = null;
         });
    }

    // Initial setup for existing icons
    document.querySelectorAll(".desktop-icon").forEach(setupDesktopIconEventListeners);

    // Desktop drop zone listeners (Keep as is)
     desktop.addEventListener('dragover', (e) => {
         e.preventDefault();
         e.dataTransfer.dropEffect = 'move';
     });

     desktop.addEventListener('drop', (e) => {
         e.preventDefault();
         if (draggedIcon) {
             const desktopRect = desktop.getBoundingClientRect();
             let newX = e.clientX - desktopRect.left - dragIconOffsetX;
             let newY = e.clientY - desktopRect.top - dragIconOffsetY;

             // Boundary check
             newX = Math.max(0, Math.min(newX, desktopRect.width - draggedIcon.offsetWidth));
             newY = Math.max(0, Math.min(newY, desktopRect.height - draggedIcon.offsetHeight));

             // Grid snap
             const gridSize = 15;
             newX = Math.round(newX / gridSize) * gridSize;
             newY = Math.round(newY / gridSize) * gridSize;

             draggedIcon.style.left = `${newX}px`;
             draggedIcon.style.top = `${newY}px`;
             draggedIcon.classList.remove('dragging');

             saveState();
         }
         draggedIcon = null;
     });


    // Function to position initial icons if no saved state
     function positionInitialIcons() {
         // *** Only run if not already positioned by loadState ***
         if (initialIconPositioningDone) return;
         console.log("Positioning initial icons...");

         const icons = document.querySelectorAll('#desktop > .desktop-icon');
         const padding = 15; // Increased padding
         const iconWidth = 90;
         const iconHeight = 95;
         const desktopHeight = desktop.clientHeight;
         const iconsPerColumn = Math.max(1, Math.floor((desktopHeight - padding * 2) / iconHeight)); // Ensure at least 1
         let col = 0;
         let row = 0;

         icons.forEach((icon) => {
             // Only position if style.left/top are not already set
             if (!icon.style.left && !icon.style.top) {
                icon.style.left = `${padding + col * (iconWidth + padding)}px`;
                icon.style.top = `${padding + row * iconHeight}px`;
                row++;
                if (row >= iconsPerColumn) {
                    row = 0;
                    col++;
                }
            }
         });
          initialIconPositioningDone = true; // Mark as done
          saveState(); // Save the default positions if we just set them
     }

    // --- Context Menu Logic --- (Keep as is from previous version)
    function showContextMenu(x, y, targetElement) {
        hidePopups(contextMenu);
        contextMenu.style.display = "block";
        contextMenu.querySelectorAll('.context-submenu').forEach(submenu => submenu.style.display = 'none');
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => item.classList.remove('hover'));

        const isDesktopTarget = (targetElement === desktop || targetElement === windowContainer);
        const undoItem = contextMenu.querySelector('[data-action="undo"]');
        if (undoItem) undoItem.classList.toggle('disabled', isDesktopTarget);

        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let finalX = x;
        let finalY = y;
        const effectiveViewportHeight = viewportHeight - TASKBAR_HEIGHT;

        if (x + menuWidth > viewportWidth) finalX = viewportWidth - menuWidth - 5;
        if (y + menuHeight > effectiveViewportHeight) finalY = effectiveViewportHeight - menuHeight - 5;
        if (finalX < 5) finalX = 5;
        if (finalY < 5) finalY = 5;

        contextMenu.style.left = `${finalX}px`;
        contextMenu.style.top = `${finalY}px`;
    }

    function hideContextMenu() {
        if (contextMenu.style.display === "block") {
            contextMenu.style.display = "none";
            contextMenu.querySelectorAll('.context-submenu').forEach(submenu => submenu.style.display = 'none');
        }
    }

    desktop.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const targetIcon = event.target.closest('.desktop-icon');
         if (event.target === desktop || event.target === windowContainer || targetIcon) {
             if (targetIcon) {
                 if (!targetIcon.classList.contains('active-select')) {
                      deselectAllDesktopIcons();
                      targetIcon.classList.add('active-select');
                 }
             } else {
                deselectAllDesktopIcons();
             }
            showContextMenu(event.clientX, event.clientY, event.target);
        } else {
            hideContextMenu();
        }
    }, false);

    taskbar.addEventListener('contextmenu', e => e.preventDefault());

    contextMenu.querySelectorAll('.has-submenu').forEach(item => {
        const submenu = item.querySelector('.context-submenu');
        if (!submenu) return;

        item.addEventListener('mouseenter', () => {
            item.parentElement.querySelectorAll(':scope > .has-submenu > .context-submenu').forEach(otherSubmenu => {
                 if (otherSubmenu !== submenu) {
                     otherSubmenu.style.display = 'none';
                 }
             });

            submenu.style.display = 'block';
            const itemRect = item.getBoundingClientRect();
            const menuRect = contextMenu.getBoundingClientRect(); // Use context menu bounds
            const subRect = submenu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
             const viewportHeight = window.innerHeight - TASKBAR_HEIGHT;

             // Default position: right of the item
             submenu.style.left = '100%';
             submenu.style.top = '-7px'; // Align top edges approx

             // Re-check bounds after setting display and default position
            const finalSubRect = submenu.getBoundingClientRect();

            if (finalSubRect.right > viewportWidth) {
                submenu.style.left = `-${finalSubRect.width -4}px`; // Position to the left
            }
             if (finalSubRect.bottom > viewportHeight) {
                 // Adjust top: try to keep it within viewport
                 submenu.style.top = `${viewportHeight - finalSubRect.height - menuRect.top - 7}px`;
             }
             if (finalSubRect.left < 0 && submenu.style.left !== '100%') { // If positioned left and still off-screen
                 submenu.style.left = '5px'; // Bring it on screen
             }
             if (finalSubRect.top < 0) { // Prevent going off top
                 submenu.style.top = '0px';
             }
        });

        // Improved leave handling using relatedTarget
         const hideSubmenu = (relatedTarget) => {
             // Check if the related target is outside both the item and its submenu
             if (!submenu.contains(relatedTarget) && !item.contains(relatedTarget)) {
                 submenu.style.display = 'none';
             }
         };
        item.addEventListener('mouseleave', (e) => hideSubmenu(e.relatedTarget));
        submenu.addEventListener('mouseleave', (e) => hideSubmenu(e.relatedTarget));
    });


    contextMenu.addEventListener('click', (e) => {
        const targetItem = e.target.closest('.context-menu-item:not(.disabled), .context-submenu li:not(.disabled)');
        if (!targetItem) return;

        const action = targetItem.dataset.action || targetItem.closest('.context-menu-item')?.dataset.action;
        const subAction = targetItem.dataset.subAction;

        switch (action) {
             case 'refresh':
                 desktop.style.transition = 'opacity 0.1s ease-in-out';
                 desktop.style.opacity = 0.95;
                 setTimeout(() => { desktop.style.opacity = 1; desktop.style.transition = ''; }, 100);
                 break;
             case 'personalize':
             case 'display-settings':
             case 'change-background':
                 const settingsDetails = getAppDetailsFromIcon(document.getElementById('settings-icon') || { id: 'settings-icon', title: 'Settings', dataset: { iconUrl: 'https://img.icons8.com/fluency/48/settings.png'} });
                 if (settingsDetails) {
                     const settingsWindow = createWindow(
                         settingsDetails.id, settingsDetails.title, settingsDetails.iconUrl,
                         windowContentGenerators[settingsDetails.contentGeneratorName](),
                         settingsDetails.width, settingsDetails.height,
                         undefined, undefined, settingsDetails.contentGeneratorName, settingsDetails.appType
                      );
                     if (settingsWindow && document.body.contains(settingsWindow)) {
                         const sectionId = (action === 'display-settings') ? 'display' : 'personalization';
                         const sidebarLink = settingsWindow.querySelector(`.settings-sidebar li[data-section="${sectionId}"]`);
                         if (sidebarLink) setTimeout(() => sidebarLink.click(), 50); // Delay slightly
                     }
                  }
                 break;
             case 'new':
                 handleNewItem(subAction, e.clientX, e.clientY);
                 break;
             case 'open-terminal':
                 alert('Open in Terminal (Not Implemented)');
                 break;
         }

        if (!targetItem.classList.contains('has-submenu') && !targetItem.closest('.has-submenu')) {
            hideContextMenu();
        }
    });

    // --- createDesktopIcon, handleNewItem --- (Keep as is from previous version)
    function createDesktopIcon(id, title, spanText, iconUrl, isDynamic = false) {
         const icon = document.createElement('div');
         icon.className = 'desktop-icon';
         icon.id = id;
         icon.title = title;
         icon.draggable = true;
         if (iconUrl) icon.dataset.iconUrl = iconUrl;
         if (isDynamic) icon.classList.add('dynamic-item');

         const img = document.createElement('img');
         img.src = iconUrl || 'https://img.icons8.com/fluency/48/folder-win11.png';
         img.alt = title;

         const span = document.createElement('span');
         span.textContent = spanText;

         icon.appendChild(img);
         icon.appendChild(span);
         desktop.appendChild(icon);

         // *** IMPORTANT: Add event listeners to newly created icon ***
         setupDesktopIconEventListeners(icon);

         return icon;
     }

     function handleNewItem(type, x, y) {
         if (!type) return;

         const desktopRect = desktop.getBoundingClientRect();
         let iconX = x - desktopRect.left - 10;
         let iconY = y - desktopRect.top - 20;

         const gridSize = 15;
         iconX = Math.max(0, Math.round(iconX / gridSize) * gridSize);
         iconY = Math.max(0, Math.round(iconY / gridSize) * gridSize);

         let title, iconUrl, baseName;
         const newId = `dt-item-${nextDesktopItemId++}`;

         if (type === 'new-folder') { baseName = 'New Folder'; iconUrl = 'https://img.icons8.com/?size=100&id=59786&format=png&color=E9F158'; }
         else if (type === 'new-text') { baseName = 'New Text Document'; iconUrl = 'https://img.icons8.com/color/48/txt.png'; }
         else { return; } // Only handle folder/text for now

         let count = 0;
         let finalName = baseName;
         // Check existing icons for name collision
         const existingNames = Array.from(document.querySelectorAll('.desktop-icon span')).map(s => s.textContent);
         while (existingNames.includes(finalName)) {
             count++;
             finalName = `${baseName} (${count})`;
         }
         title = finalName;

         const newIcon = createDesktopIcon(newId, title, finalName, iconUrl, true);
         newIcon.style.left = `${iconX}px`;
         newIcon.style.top = `${iconY}px`;

         deselectAllDesktopIcons();
         newIcon.classList.add('active-select');

         saveState();
     }

    // --- Start Menu App Launch ---
    startMenu.querySelectorAll('.start-app-icon').forEach(appIcon => {
        appIcon.addEventListener('click', () => {
            const appId = appIcon.dataset.appId;
            const appTitle = appIcon.title;
            const appIconUrl = appIcon.querySelector('img')?.src;

             const details = getAppDetailsFromIcon({
                id: `${appId}-icon`, // Mimic desktop icon ID format
                title: appTitle,
                 // Provide a simple querySelector mimic for getAppDetailsFromIcon
                 querySelector: (sel) => (sel === 'img' ? { src: appIconUrl } : null),
                 classList: { contains: () => false }, // Assume start menu items aren't 'dynamic'
                 dataset: { iconUrl: appIconUrl }
             });

             if (details) {
                 let content = '';
                 if (typeof details.contentGeneratorName === 'string' && windowContentGenerators[details.contentGeneratorName]) {
                     content = windowContentGenerators[details.contentGeneratorName]();
                 } else if (typeof details.contentGeneratorName === 'function') {
                     content = details.contentGeneratorName();
                     details.contentGeneratorName = null;
                 } else {
                     console.error("Invalid content generator for:", details.title);
                     content = `<div style="padding:20px; color:red;">Error loading content for ${details.title}</div>`;
                 }

                 createWindow(
                     details.id, details.title, details.iconUrl, content,
                     details.width, details.height, undefined, undefined,
                     details.contentGeneratorName, details.appType
                 );
                 hidePopups(); // Hide start menu
             } else {
                 alert(`${appTitle} app not implemented yet.`);
                 hidePopups();
             }
        });
    });


    // --- Initial Load ---
    loadState(); // Load saved state first
     // Position initial icons ONLY if loadState didn't find/apply any saved positions
     if (!initialIconPositioningDone) {
        positionInitialIcons();
     }


}); 
