document.addEventListener("DOMContentLoaded", () => {
  const desktop = document.getElementById("desktop");
  const taskbarClockTime = document.getElementById("clock-time");
  const taskbarClockDate = document.getElementById("clock-date");
  const windowContainer = document.getElementById("window-container");
  const windowTemplate = document.getElementById("window-template");
  const startButton = document.getElementById("start-button");
  const startMenu = document.getElementById("start-menu");
  const trayArrow = document.getElementById("tray-arrow");
  const trayFlyout = document.getElementById("tray-flyout");
  const minimizedWindowsContainer =
    document.getElementById("minimized-windows");
  const taskbar = document.getElementById("taskbar");
  const contextMenu = document.getElementById("context-menu");

  let highestZIndex = 10;
  let openWindows = {};
  const TASKBAR_HEIGHT = 48;

  function updateClock() {
    const now = new Date();
    const timeOptions = { hour: "numeric", minute: "2-digit", hour12: true };
    const dateOptions = { month: "numeric", day: "numeric", year: "numeric" };
    taskbarClockTime.textContent = now.toLocaleTimeString("en-US", timeOptions);
    taskbarClockDate.textContent = now.toLocaleDateString("en-US", dateOptions);
  }
  setInterval(updateClock, 1000);
  updateClock();

  function setupPopup(triggerElement, popupElement) {
    triggerElement.addEventListener("click", (event) => {
      event.stopPropagation();
      const isActive = popupElement.classList.toggle("active");
      if (isActive) {
        if (popupElement === startMenu) trayFlyout.classList.remove("active");
        if (popupElement === trayFlyout) startMenu.classList.remove("active");
        hideContextMenu(); // Also hide context menu
      }
    });
  }

  function handleClickOutside(event) {
    if (
      startMenu.classList.contains("active") &&
      !startMenu.contains(event.target) &&
      !startButton.contains(event.target)
    ) {
      startMenu.classList.remove("active");
    }
    if (
      trayFlyout.classList.contains("active") &&
      !trayFlyout.contains(event.target) &&
      !trayArrow.contains(event.target)
    ) {
      trayFlyout.classList.remove("active");
    }
    if (
      contextMenu.style.display === "block" &&
      !contextMenu.contains(event.target)
    ) {
      hideContextMenu();
    }
    // Deselect desktop icons on desktop click
    if (
      desktop.contains(event.target) &&
      !event.target.closest(".desktop-icon")
    ) {
      document
        .querySelectorAll(".desktop-icon.active-select")
        .forEach((i) => i.classList.remove("active-select"));
    }
  }

  document.addEventListener("click", handleClickOutside);

  setupPopup(startButton, startMenu);
  setupPopup(trayArrow, trayFlyout);

  function bringToFront(windowId) {
    if (!openWindows[windowId] || openWindows[windowId].state === "minimized")
      return;

    highestZIndex++;
    openWindows[windowId].element.style.zIndex = highestZIndex;
    openWindows[windowId].element.focus();

    document
      .querySelectorAll(".minimized-btn.active")
      .forEach((btn) => btn.classList.remove("active"));
    if (openWindows[windowId].taskbarButton) {
      openWindows[windowId].taskbarButton.classList.add("active");
    }
    // Deactivate other active taskbar icons (like file explorer) if needed
    document.querySelectorAll(".taskbar-icon.active").forEach((icon) => {
      // Example: don't deactivate the main explorer button maybe? Or handle specific app buttons
      if (icon.id !== "explorer-button") {
        // Keep explorer active for demo
        // icon.classList.remove('active');
      }
    });
  }

  function createMinimizedTaskbarItem(id, title, iconSrc) {
    const button = document.createElement("button");
    button.className = "minimized-btn";
    button.dataset.windowId = id;
    button.title = title;

    const img = document.createElement("img");
    img.src = iconSrc || "https://img.icons8.com/fluency/16/window-close.png";
    img.alt = title.substring(0, 3);

    button.appendChild(img);

    button.addEventListener("click", () => {
      restoreWindow(id);
      bringToFront(id);
    });

    minimizedWindowsContainer.appendChild(button);
    openWindows[id].taskbarButton = button;
    button.classList.add("active");
  }

  function removeMinimizedTaskbarItem(id) {
    if (openWindows[id]?.taskbarButton) {
      openWindows[id].taskbarButton.remove();
      delete openWindows[id].taskbarButton;
    }
  }

  function minimizeWindow(id) {
    const win = openWindows[id];
    if (!win || win.state === "minimized") return;

    win.state = "minimized";
    win.element.classList.add("minimized");
    win.element.setAttribute("aria-hidden", "true");

    if (!win.taskbarButton) {
      createMinimizedTaskbarItem(id, win.title, win.icon);
    }
    if (win.taskbarButton) {
      // Ensure button exists before removing active
      win.taskbarButton.classList.remove("active");
    }

    let topWinId = null;
    let maxZ = 0;
    for (const winId in openWindows) {
      if (
        openWindows[winId].state !== "minimized" &&
        parseInt(openWindows[winId].element.style.zIndex || 0) > maxZ
      ) {
        maxZ = parseInt(openWindows[winId].element.style.zIndex || 0);
        topWinId = winId;
      }
    }
    if (topWinId) {
      bringToFront(topWinId);
    }
  }

  function maximizeWindow(id) {
    const win = openWindows[id];
    if (!win || win.state === "maximized" || win.state === "minimized") return;

    win.state = "maximized";
    win.originalBounds = {
      top: win.element.offsetTop,
      left: win.element.offsetLeft,
      width: win.element.offsetWidth,
      height: win.element.offsetHeight,
    };

    win.element.classList.add("maximized");
    // Maximize within the desktop area (above taskbar)
    win.element.style.top = `0px`;
    win.element.style.left = `0px`;
    win.element.style.width = `${windowContainer.offsetWidth}px`;
    win.element.style.height = `${windowContainer.offsetHeight}px`;

    const maxRestoreBtn = win.element.querySelector(".win-maximize-restore i");
    maxRestoreBtn.className = "fa-regular fa-window-restore"; // Change class directly
    maxRestoreBtn.parentElement.title = "Restore";
    bringToFront(id);
  }

  function restoreWindow(id) {
    const win = openWindows[id];
    if (!win) return;

    if (win.state === "minimized") {
      win.state = "normal";
      win.element.classList.remove("minimized");
      win.element.setAttribute("aria-hidden", "false");
      if (win.taskbarButton) {
        win.taskbarButton.classList.add("active");
      }
      bringToFront(id);
    } else if (win.state === "maximized") {
      win.state = "normal";
      win.element.classList.remove("maximized");

      if (win.originalBounds) {
        win.element.style.top = `${win.originalBounds.top}px`;
        win.element.style.left = `${win.originalBounds.left}px`;
        win.element.style.width = `${win.originalBounds.width}px`;
        win.element.style.height = `${win.originalBounds.height}px`;
      }

      const maxRestoreBtn = win.element.querySelector(
        ".win-maximize-restore i"
      );
      maxRestoreBtn.className = "fa-regular fa-square"; // Change back to square
      maxRestoreBtn.parentElement.title = "Maximize";
      bringToFront(id);
    } else {
      bringToFront(id);
    }
  }

  function closeWindow(id) {
    const win = openWindows[id];
    if (!win) return;

    win.element.style.opacity = "0";
    win.element.style.transform = "scale(0.95)";

    setTimeout(() => {
      win.element.remove();
      removeMinimizedTaskbarItem(id);
      delete openWindows[id];

      let topWinId = null;
      let maxZ = 0;
      for (const winId in openWindows) {
        if (
          openWindows[winId].state !== "minimized" &&
          parseInt(openWindows[winId].element.style.zIndex || 0) > maxZ
        ) {
          maxZ = parseInt(openWindows[winId].element.style.zIndex || 0);
          topWinId = winId;
        }
      }
      if (topWinId) {
        bringToFront(topWinId);
      }
    }, 150);
  }

  function makeDraggable(windowElement, windowId) {
    const titleBar = windowElement.querySelector(".window-titlebar");
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    titleBar.addEventListener("mousedown", (e) => {
      if (e.target.closest(".window-control")) return;
      if (openWindows[windowId]?.state === "maximized") return;

      isDragging = true;
      dragOffsetX = e.clientX - windowElement.offsetLeft;
      dragOffsetY = e.clientY - windowElement.offsetTop;
      windowElement.style.cursor = "grabbing";
      bringToFront(windowId);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    titleBar.addEventListener("dblclick", (e) => {
      if (e.target.closest(".window-control")) return;
      if (openWindows[windowId]?.state === "maximized") {
        restoreWindow(windowId);
      } else if (openWindows[windowId]?.state === "normal") {
        maximizeWindow(windowId);
      }
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      let newX = e.clientX - dragOffsetX;
      let newY = e.clientY - dragOffsetY;

      const containerRect = windowContainer.getBoundingClientRect();
      newX = Math.max(
        -windowElement.offsetWidth + 80,
        Math.min(newX, containerRect.width - 40)
      );
      newY = Math.max(
        0,
        Math.min(newY, containerRect.height - titleBar.offsetHeight)
      );

      windowElement.style.left = `${newX}px`;
      windowElement.style.top = `${newY}px`;
    }

    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      windowElement.style.cursor = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    windowElement.addEventListener(
      "mousedown",
      (e) => {
        if (openWindows[windowId]?.state !== "minimized") {
          const currentZ = parseInt(windowElement.style.zIndex || 0);
          if (currentZ < highestZIndex) {
            bringToFront(windowId);
          }
          document
            .querySelectorAll(".minimized-btn.active")
            .forEach((btn) => btn.classList.remove("active"));
          if (openWindows[windowId]?.taskbarButton) {
            openWindows[windowId]?.taskbarButton.classList.add("active");
          }
        }
      },
      true
    );
  }

  function setupWindowControls(windowElement, windowId) {
    const minimizeButton = windowElement.querySelector(".win-minimize");
    const maximizeRestoreButton = windowElement.querySelector(
      ".win-maximize-restore"
    );
    const closeButton = windowElement.querySelector(".win-close");

    minimizeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      minimizeWindow(windowId);
    });
    maximizeRestoreButton.addEventListener("click", (e) => {
      e.stopPropagation();
      if (openWindows[windowId]?.state === "maximized") restoreWindow(windowId);
      else maximizeWindow(windowId);
    });
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      closeWindow(windowId);
    });
  }

  function createWindow(
    id,
    title,
    iconSrc,
    contentHtml,
    initialWidth = 600,
    initialHeight = 400
  ) {
    if (openWindows[id] && openWindows[id].state === "minimized") {
      restoreWindow(id);
      bringToFront(id);
      return;
    } else if (openWindows[id]) {
      bringToFront(id);
      return;
    }

    const windowEl = windowTemplate.content.firstElementChild.cloneNode(true);
    windowEl.id = `window-${id}`;
    windowEl.querySelector(".window-title").textContent = title;
    windowEl.querySelector(".window-icon").src = iconSrc;
    windowEl.querySelector(".window-icon").alt = title;
    windowEl.querySelector(".window-content").innerHTML = contentHtml;

    const offsetX = Math.floor(Math.random() * 150) + 70;
    const offsetY = Math.floor(Math.random() * 80) + 40;
    windowEl.style.left = `${offsetX}px`;
    windowEl.style.top = `${offsetY}px`;
    windowEl.style.width = `${initialWidth}px`;
    windowEl.style.height = `${initialHeight}px`;

    windowContainer.appendChild(windowEl);

    openWindows[id] = {
      element: windowEl,
      state: "normal",
      originalBounds: null,
      taskbarButton: null,
      title: title,
      icon: iconSrc,
    };

    makeDraggable(windowEl, id);
    setupWindowControls(windowEl, id);
    bringToFront(id);

    const focusable = windowEl.querySelector("textarea, input");
    if (focusable) focusable.focus();
    else windowEl.focus();
  }

  function createMyComputerContent() {
    return `<div class="file-explorer-content"><div class="fe-sidebar"><h4>Favourites</h4><ul><li><i class="fa-solid fa-desktop"></i> Desktop</li><li><i class="fa-solid fa-download"></i> Downloads</li><li><i class="fa-regular fa-file-lines"></i> Documents</li><li><i class="fa-regular fa-image"></i> Pictures</li></ul><h4>This PC</h4><ul><li class="active"><i class="fa-solid fa-display"></i> This PC</li><li><i class="fa-solid fa-music"></i> Music</li><li><i class="fa-solid fa-video"></i> Videos</li></ul><h4>Network</h4><ul><li><i class="fa-solid fa-network-wired"></i> Network</li></ul></div><div class="fe-main"><div class="fe-section-title">Devices and drives</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-solid fa-hard-drive"></i><span>Local Disk (C:)</span></div><div class="fe-item"><i class="fa-solid fa-compact-disc"></i><span>DVD RW Drive (D:)</span></div><div class="fe-item"><i class="fa-solid fa-network-wired"></i><span>Network Location</span></div></div><div class="fe-section-title" style="margin-top: 20px;">Folders</div><div class="fe-items-grid"><div class="fe-item"><i class="fa-solid fa-folder"></i><span>Desktop</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Documents</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Downloads</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Music</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Pictures</span></div> <div class="fe-item"><i class="fa-solid fa-folder"></i><span>Videos</span></div></div></div></div>`;
  }
  function createNotepadContent() {
    return `<textarea class="notepad-content" spellcheck="false"></textarea>`;
  }
  function createRecycleBinContent() {
    return `<div style="padding: 30px; text-align: center; color: #666;"><i class="fas fa-recycle" style="font-size: 48px; margin-bottom: 15px;"></i><p>Recycle Bin is empty</p></div>`;
  }

  document.querySelectorAll(".desktop-icon").forEach((icon) => {
    icon.addEventListener("dblclick", () => {
      const id = icon.id.replace("-icon", "");
      const title = icon.title;
      const iconUrl =
        icon.dataset.iconUrl ||
        "https://img.icons8.com/fluency/16/window-close.png";
      let content = "";
      let width = 750;
      let height = 500;

      switch (id) {
        case "my-computer":
          content = createMyComputerContent();
          width = 850;
          height = 550;
          break;
        case "recycle-bin":
          content = createRecycleBinContent();
          width = 500;
          height = 350;
          break;
        case "notepad":
          content = createNotepadContent();
          width = 600;
          height = 450;
          break;
        default:
          content = `<div style="padding:20px;">Content for ${title}</div>`;
      }
      createWindow(id, title, iconUrl, content, width, height);
      document
        .querySelectorAll(".desktop-icon.active-select")
        .forEach((i) => i.classList.remove("active-select"));
    });
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      document
        .querySelectorAll(".desktop-icon.active-select")
        .forEach((i) => i.classList.remove("active-select"));
      icon.classList.add("active-select");
      hideContextMenu(); // Hide context menu on icon click
    });
  });

  desktop.addEventListener("dragstart", (e) => {
    if (
      e.target.classList.contains("desktop-icon") ||
      e.target.closest(".desktop-icon")
    ) {
      e.preventDefault();
    }
  });

  // Context Menu Logic
  function showContextMenu(x, y) {
    contextMenu.style.display = "block";
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let finalX = x;
    let finalY = y;
    const effectiveViewportHeight = viewportHeight - TASKBAR_HEIGHT;

    if (x + menuWidth > viewportWidth) finalX = viewportWidth - menuWidth - 5;
    if (y + menuHeight > effectiveViewportHeight)
      finalY = effectiveViewportHeight - menuHeight - 5;
    if (finalX < 5) finalX = 5;
    if (finalY < 5) finalY = 5;

    contextMenu.style.left = `${finalX}px`;
    contextMenu.style.top = `${finalY}px`;
  }

  function hideContextMenu() {
    contextMenu.style.display = "none";
  }

  desktop.addEventListener("contextmenu", (event) => {
    // Only show context menu if right-clicking directly on desktop, not icons
    if (event.target === desktop || event.target === windowContainer) {
      event.preventDefault();
      startMenu.classList.remove("active");
      trayFlyout.classList.remove("active");
      hideContextMenu();
      showContextMenu(event.clientX, event.clientY);
    } else {
      // Allow default context menu for icons or windows if needed, or just hide ours
      hideContextMenu();
    }
  });

  document.addEventListener(
    "contextmenu",
    (event) => {
      if (
        !desktop.contains(event.target) &&
        contextMenu.style.display === "block"
      ) {
        hideContextMenu();
      }
    },
    true
  );

  contextMenu.querySelectorAll(".context-menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const actionLabel = item.querySelector(".label")?.textContent.trim();
      console.log(`Context menu action: ${actionLabel}`);

      if (actionLabel === "Refresh") {
        desktop.style.transition = "opacity 0.1s ease-in-out";
        desktop.style.opacity = 0.95;
        setTimeout(() => {
          desktop.style.opacity = 1;
        }, 100);
      }
      if (actionLabel === "Personalize" || actionLabel === "Display settings") {
        const settingsId = actionLabel.toLowerCase().replace(" ", "-");
        const settingsIcon =
          actionLabel === "Personalize"
            ? "https://img.icons8.com/fluency/16/paint-palette.png"
            : "https://img.icons8.com/fluency/16/laptop-settings.png";
        createWindow(
          settingsId,
          actionLabel,
          settingsIcon,
          `<div style="padding:30px; text-align:center; color:#555;">${actionLabel} simulation (Not implemented)</div>`,
          500,
          350
        );
      }
      // TODO: Implement other context menu actions

      hideContextMenu();
    });
  });
});
