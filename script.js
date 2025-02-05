let ignitionTemplate = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Fetch and store the base Ignition config
    try {
        const response = await fetch('https://raw.githubusercontent.com/jakelmg/easy-cloud-vpn/main/system-config.ign');
        ignitionTemplate = await response.json();
    } catch (error) {
        console.error('Failed to load Ignition template:', error);
        return;
    }

    // Initialize the page
    initPage();

    // Update preview whenever any input changes
    document.querySelectorAll('input, select').forEach(element => {
        element.addEventListener('input', updatePreview);
        element.addEventListener('change', updatePreview);
    });

    // Initial preview update
    updatePreview();
});

// Helper function for base64/gzip handling
function decompressGzip(base64String) {
    try {
        const binaryString = atob(base64String);
        const byteArray = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            byteArray[i] = binaryString.charCodeAt(i);
        }
        return pako.inflate(byteArray, { to: 'string' });
    } catch (error) {
        throw new Error(`Decompression failed: ${error.message}`);
    }
}

function compressToGzipBase64(text) {
    try {
        const compressed = pako.gzip(text);
        const binaryString = String.fromCharCode.apply(null, compressed);
        return btoa(binaryString);
    } catch (error) {
        throw new Error(`Compression failed: ${error.message}`);
    }
}

function validateInputs() {
    const tailscaleInput = document.getElementById('tailscaleKey');
    const sshEnabled = document.getElementById('sshEnabled').checked;
    const sshKey = document.getElementById('sshKey').value.trim();
    const tailscaleKeyRegex = /^tskey-auth-[A-Za-z0-9]+-[A-Za-z0-9]+$/;
    const sshKeyRegex = /^(ecdsa-sha2-nistp(256|384|521)\s+AAAAE2VjZHNhLXNoYTItbmlzdHA|sk-ecdsa-sha2-nistp256@openssh.com\s+AAAAInNrLWVjZHNhLXNoYTItbmlzdHAyNTZAb3BlbnNzaC5jb2|ssh-ed25519\s+AAAAC3NzaC1lZDI1NTE5|sk-ssh-ed25519@openssh.com\s+AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29t|ssh-rsa\s+AAAAB3NzaC1yc2)[0-9A-Za-z+/]+[=]{0,3}(\s.*)?$/;
    
    const isTailscaleValid = tailscaleKeyRegex.test(tailscaleInput.value.trim());
    const isSshValid = !sshEnabled || (sshEnabled && sshKeyRegex.test(sshKey));
    
    const copyButton = document.querySelector('.copy-button');
    const generateButton = document.querySelector('button.button');
    
    // Update Tailscale input validation state
    if (tailscaleInput.value.trim()) {
        if (isTailscaleValid) {
            tailscaleInput.classList.remove('invalid');
        } else {
            tailscaleInput.classList.add('invalid');
        }
    } else {
        tailscaleInput.classList.remove('invalid');
    }
    
    // Update SSH input validation state
    const sshInput = document.getElementById('sshKey');
    if (sshEnabled) {
        if (!sshKey || !sshKeyRegex.test(sshKey)) {
            sshInput.classList.add('invalid');
        } else {
            sshInput.classList.remove('invalid');
        }
    } else {
        sshInput.classList.remove('invalid');
    }
    
    // Update button states
    const isValid = isTailscaleValid && isSshValid;
    generateButton.disabled = !isValid;
    if (isValid) {
        copyButton.classList.add('visible');
    } else {
        copyButton.classList.remove('visible');
    }
}

function initPage() {
    // Timezone population
    const tzSelect = document.getElementById('timezone');
    moment.tz.names()
        .forEach(tz => {
            const option = document.createElement('option');
            option.value = tz;
            option.textContent = tz.replace('_', ' ');
            tzSelect.appendChild(option);
        });

    // Reboot time population
    const timeSelect = document.getElementById('rebootTime');
    for (let hour = 0; hour < 24; hour++) {
        const option = document.createElement('option');
        const timeString = String(hour).padStart(2, '0') + ':00';
        option.value = timeString;
        option.textContent = timeString;
        timeSelect.appendChild(option);
    }

    // Set defaults
    document.getElementById('autoReboot').checked = true;
    document.getElementById('rebootTime').value = '02:00';
    document.getElementById('rebootWindow').value = 1;

    // Initialize visibility
    updateVisibility();

    // Add event listeners for visibility toggles
    document.getElementById('setTimezone').addEventListener('change', updateVisibility);
    document.getElementById('sshEnabled').addEventListener('change', () => {
        updateVisibility();
        validateInputs();
    });
    document.getElementById('autoReboot').addEventListener('change', updateVisibility);

    // Add event listeners for validation
    document.getElementById('tailscaleKey').addEventListener('input', validateInputs);
    document.getElementById('sshKey').addEventListener('input', validateInputs);

    // Set initial button states
    validateInputs();
}

function updateVisibility() {
    // Timezone
    document.getElementById('timezoneGroup').classList.toggle(
        'hidden',
        !document.getElementById('setTimezone').checked
    );

    // SSH Key
    document.getElementById('sshKey').classList.toggle(
        'hidden',
        !document.getElementById('sshEnabled').checked
    );

    // Reboot Options
    document.getElementById('rebootOptions').classList.toggle(
        'hidden',
        !document.getElementById('autoReboot').checked
    );
}

async function updatePreview() {
    try {
        if (!ignitionTemplate) {
            throw new Error('Ignition template not loaded');
        }

        const config = JSON.parse(JSON.stringify(ignitionTemplate)); // Deep clone

        // Handle SSH configuration first to ensure passwd section is at the top
        const sshEnabled = document.getElementById('sshEnabled').checked;
        const sshKey = document.getElementById('sshKey').value.trim();

        // Create a new config object with the correct order
        const orderedConfig = {
            ignition: config.ignition
        };

        // Add passwd section if SSH is enabled and key is provided
        if (sshEnabled && sshKey) {
            orderedConfig.passwd = {
                users: [{
                    name: 'core',
                    sshAuthorizedKeys: [sshKey]
                }]
            };
        }

        // Add all other sections in order
        Object.keys(config).forEach(key => {
            if (key !== 'ignition' && key !== 'passwd') {
                orderedConfig[key] = config[key];
            }
        });

        // Update Tailscale auth key
        const tailscaleService = orderedConfig.systemd.units.find(u => u.name === 'tailscale.service');
        if (tailscaleService && tailscaleService.contents) {
            const authKey = document.getElementById('tailscaleKey').value;
            tailscaleService.contents = tailscaleService.contents.replace(
                /-e TS_AUTHKEY=.*?\\/,
                `-e TS_AUTHKEY=${authKey} \\`
            );
        }

        // Update iptables for SSH
        const iptablesFile = orderedConfig.storage.files.find(f => f.path === '/var/lib/iptables/rules-save');
        if (iptablesFile && iptablesFile.contents) {
            const currentRules = decompressGzip(iptablesFile.contents.source.split(',')[1]);
            let newRules = currentRules;

            if (sshEnabled) {
                if (!currentRules.includes('-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT')) {
                    newRules = currentRules.replace(
                        /(-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT\n)/,
                        "$1-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT\n"
                    );
                }
            } else {
                newRules = currentRules.replace(
                    /-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT\n/g, ''
                );
            }
            
            iptablesFile.contents.source = `data:;base64,${compressToGzipBase64(newRules)}`;
        }

        // Update timezone
        const timezoneSet = document.getElementById('setTimezone').checked;
        const tzValue = timezoneSet ? document.getElementById('timezone').value : 'Etc/UTC';
        
        // Update timezone link
        if (orderedConfig.storage.links) {
            const tzLink = orderedConfig.storage.links.find(l => l.path === '/etc/localtime');
            if (tzLink) {
                tzLink.target = `/usr/share/zoneinfo/${tzValue}`;
            }
        }

        // Update auto-reboot settings
        const updateConf = orderedConfig.storage.files.find(f => f.path === '/etc/flatcar/update.conf');
        if (updateConf && updateConf.contents) {
            if (document.getElementById('autoReboot').checked) {
                const [hours, minutes] = document.getElementById('rebootTime').value.split(':');
                const windowHours = document.getElementById('rebootWindow').value;
                updateConf.contents.source = `data:;base64,${compressToGzipBase64(
                    `REBOOT_STRATEGY=reboot\n` +
                    `LOCKSMITHD_REBOOT_WINDOW_START=${hours}:${minutes}\n` +
                    `LOCKSMITHD_REBOOT_WINDOW_LENGTH=${windowHours}h\n`
                )}`;
            } else {
                updateConf.contents.source = `data:;base64,${compressToGzipBase64('REBOOT_STRATEGY=off\n')}`;
            }
        }

        document.getElementById('configPreview').textContent = JSON.stringify(orderedConfig, null, 2);
    } catch (error) {
        document.getElementById('configPreview').textContent = `Error: ${error.message}`;
    }
}

async function generateConfig() {
    try {
        // Validate inputs
        const requiredFields = [
            { 
                id: 'tailscaleKey', 
                message: 'Invalid or missing Tailscale auth key!',
                validate: (value) => /^tskey-auth-[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(value.trim())
            },
            { 
                id: 'sshKey', 
                check: () => document.getElementById('sshEnabled').checked,
                message: 'Invalid SSH public key format!',
                validate: (value) => /^(ecdsa-sha2-nistp(256|384|521)\s+AAAAE2VjZHNhLXNoYTItbmlzdHA|sk-ecdsa-sha2-nistp256@openssh.com\s+AAAAInNrLWVjZHNhLXNoYTItbmlzdHAyNTZAb3BlbnNzaC5jb2|ssh-ed25519\s+AAAAC3NzaC1lZDI1NTE5|sk-ssh-ed25519@openssh.com\s+AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29t|ssh-rsa\s+AAAAB3NzaC1yc2)[0-9A-Za-z+/]+[=]{0,3}(\s.*)?$/.test(value.trim())
            },
            { 
                id: 'timezone', 
                check: () => document.getElementById('setTimezone').checked 
            },
        ];

        for (const field of requiredFields) {
            const element = document.getElementById(field.id);
            const value = element.value;
            if (field.check ? field.check() && !value.trim() : !value.trim()) {
                element.classList.add('invalid');
                alert(field.message || `${field.id} is required`);
                return;
            }
            if (field.validate && !field.validate(value)) {
                element.classList.add('invalid');
                alert(field.message);
                return;
            }
        }

        // Trigger download
        const config = document.getElementById('configPreview').textContent;
        const blob = new Blob([config], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated-config.ign';
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert(`Error generating config: ${error.message}`);
    }
}

async function copyConfig() {
    const configText = document.getElementById('configPreview').textContent;
    try {
        await navigator.clipboard.writeText(configText);
        const button = document.querySelector('.copy-button');
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    } catch (err) {
        alert('Failed to copy config');
    }
}

// Add keydown listener on configPreview so that Ctrl+A selects only its content when it is focused
const configPreviewEl = document.getElementById("configPreview");
if (configPreviewEl) {
    configPreviewEl.addEventListener("keydown", function(evt) {
        if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === "a") {
            evt.preventDefault();
            const range = document.createRange();
            range.selectNodeContents(this);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    });
}