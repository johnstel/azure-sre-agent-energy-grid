# Using This Lab on a Mac with Visual Studio Code

This guide walks you through every step required to get the Azure Energy Grid SRE Demo Lab running on a Mac — including how to get the interactive `menu` command working in the terminal.

---

## What You Need (Prerequisites)

Install each of these before you start:

| Tool | Why | Download |
|------|-----|----------|
| **Docker Desktop for Mac** | Required to run the dev container | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Visual Studio Code** | The IDE used by this lab | [code.visualstudio.com](https://code.visualstudio.com/) |
| **Dev Containers extension** | Lets VS Code open projects inside a container | [marketplace.visualstudio.com](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) |
| **Git** | To clone the repository | Included on macOS, or install via [brew](https://brew.sh): `brew install git` |
| **Azure subscription** | To deploy resources | [portal.azure.com](https://portal.azure.com) |

> ⚠️ **Docker Desktop must be running** before you open VS Code. The dev container cannot start without it. You should see the Docker whale icon in your Mac menu bar.

---

## Step 1 — Clone the Repository

Open Terminal and run:

```bash
git clone https://github.com/johnstel/azure-sre-agent-energy-grid.git
cd azure-sre-agent-energy-grid
```

Or, open VS Code first and use **File → Open Folder** to open the cloned directory.

---

## Step 2 — Install the Dev Containers Extension

1. Open VS Code
2. Press `⌘ + Shift + X` to open the Extensions panel
3. Search for **Dev Containers** (publisher: Microsoft)
4. Click **Install**

You can also install it directly from [this link](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).

---

## Step 3 — Open the Project in VS Code

```bash
# From the cloned directory:
code .
```

Or use **File → Open Folder** and select the `azure-sre-agent-energy-grid` folder.

---

## Step 4 — Reopen in the Dev Container

When VS Code opens the folder, it detects the `.devcontainer/devcontainer.json` file and shows a notification in the bottom-right corner:

> **"Folder contains a Dev Container configuration file. Reopen in Container?"**

Click **Reopen in Container**.

If you miss the notification, you can trigger it manually:
1. Press `⌘ + Shift + P` to open the Command Palette
2. Type **"Reopen in Container"** and press Enter

![Reopen in Container prompt](../media/menu.png)

---

## Step 5 — Wait for Container Setup (~3–5 Minutes)

VS Code will:
1. Pull the base Ubuntu container image
2. Install Azure CLI, kubectl, Helm, PowerShell, and other tools
3. Run the post-create setup script that configures all the demo shortcuts

You can watch progress in the VS Code terminal at the bottom of the screen. When setup is complete, you'll see:

```
✅ Dev container setup complete!
```

> ☕ This first-time setup only happens once. Future opens of the container are instant.

---

## Step 6 — Open a Terminal and See the Menu

1. In VS Code, press `` ⌃ + ` `` (Control + backtick) to open the integrated terminal
2. The terminal defaults to **PowerShell** (`pwsh`) — you'll see a `PS >` prompt
3. The `menu` is displayed automatically. If it doesn't appear, just type:

```powershell
menu
```

You should see:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    Azure Energy Grid SRE Demo Lab                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Commands:                                                                   ║
║    az login --use-device-code  - Login to Azure                              ║
║    deploy                      - Deploy the infrastructure                   ║
║    destroy                     - Tear down the infrastructure                ║
║    site                        - Show the grid dashboard URL                 ║
║    sre-agent                   - Show SRE Agent portal URL                   ║
║    menu                        - Show this help menu                         ║
║                                                                              ║
║  Kubernetes Shortcuts (default namespace: energy):                            ║
║    kgp, kgs, kgd               - Get pods/services/deployments               ║
║                                                                              ║
║  Break Scenarios:                                                            ║
║    break-oom, break-crash, break-image, break-cpu, break-pending             ║
║    break-probe, break-network, break-config, break-mongodb, break-service    ║
║                                                                              ║
║  Fix Commands:                                                               ║
║    fix-all                     - Restore all services to healthy state       ║
║    fix-network                 - Remove network policy                       ║
║    fix-extras                  - Delete extra broken deployments             ║
║                                                                              ║
║  Documentation: docs/                                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Step 7 — Log In to Azure

From the PowerShell terminal inside the container, run:

```powershell
azlogin
```

This runs `az login --use-device-code`. Follow the prompts:
1. A URL and a code will be printed (e.g. `https://microsoft.com/devicelogin`, code `ABC123XYZ`)
2. Open that URL in your Mac browser
3. Enter the code and sign in with your Azure account
4. Return to VS Code — the terminal will confirm you're logged in

---

## Step 8 — Deploy the Infrastructure

```powershell
deploy
```

This runs the deployment script targeting East US 2 by default (~15–25 minutes). Once complete, run:

```powershell
site
```

to get the URL for the grid dashboard.

---

## Troubleshooting

### "Docker not found" or container won't start
- Make sure **Docker Desktop** is running (look for the whale icon in the Mac menu bar)
- If Docker was just installed, restart your Mac and try again

### "Dev Containers extension not installed" message
- Open Extensions (`⌘ + Shift + X`), search for "Dev Containers", and install it
- Reload VS Code after installing

### Terminal opens with `bash` instead of PowerShell
- The dev container is configured to use PowerShell (`pwsh`) as the default terminal
- If you see `bash` instead, click the `+` dropdown arrow next to the terminal tab and select **pwsh**
- Or switch manually: type `pwsh` in the bash prompt and press Enter

### `menu` command not found
- This means you're either in a `bash` shell or the post-create script hasn't finished
- Switch to PowerShell: type `pwsh` and press Enter, then type `menu`
- If the container is still setting up, wait for `✅ Dev container setup complete!` to appear

### "Reopen in Container" option not shown
- Make sure Docker Desktop is running
- Make sure the Dev Containers extension is installed
- Press `⌘ + Shift + P` and type "Reopen in Container" to trigger it manually

### Azure login fails or asks for browser
- Device code login is designed for container environments — it works without a local browser in the container
- The URL displayed in the terminal can be opened in **any browser on your Mac**

---

## Quick Reference

| Action | Command |
|--------|---------|
| Show the menu | `menu` |
| Log in to Azure | `azlogin` |
| Deploy infrastructure | `deploy` |
| Get pod status | `kgp` |
| Apply an OOM scenario | `break-oom` |
| Restore healthy state | `fix-all` |
| Open SRE Agent portal | `sre-agent` |
| Tear down everything | `destroy` |
