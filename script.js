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

function initPage() {
    // Timezone population
    const tzSelect = document.getElementById('timezone');
    moment.tz.names()
        .filter(tz => tz.startsWith('America/'))
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
    document.getElementById('sshEnabled').addEventListener('change', updateVisibility);
    document.getElementById('autoReboot').addEventListener('change', updateVisibility);
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

        // Update Tailscale auth key
        const tailscaleService = config.systemd.units.find(u => u.name === 'tailscale.service');
        if (tailscaleService && tailscaleService.contents) {
            const authKey = document.getElementById('tailscaleKey').value;
            tailscaleService.contents = tailscaleService.contents.replace(
                /-e TS_AUTHKEY=.*?\\/,
                `-e TS_AUTHKEY=${authKey} \\`
            );
        }

        // Update timezone
        const timezoneSet = document.getElementById('setTimezone').checked;
        const tzValue = timezoneSet ? document.getElementById('timezone').value : 'UTC';
        const tzFile = config.storage.files.find(f => f.path === '/etc/localtime');
        if (tzFile && tzFile.contents) {
            tzFile.contents.source = `data:;base64,${compressToGzipBase64(tzValue)}`;
        }

        // Update SSH configuration
        const sshEnabled = document.getElementById('sshEnabled').checked;
        const sshKey = document.getElementById('sshKey').value;
        const iptablesFile = config.storage.files.find(f => f.path === '/var/lib/iptables/rules-save');

        if (sshEnabled && iptablesFile && iptablesFile.contents) {
            // Decompress and modify iptables rules
            const currentRules = decompressGzip(iptablesFile.contents.source.split(',')[1]);
            let newRules = currentRules;

            if (!currentRules.includes('-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT')) {
                newRules = currentRules.replace(
                    /(-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT\n)/,
                    "$1-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT\n"
                );
            }

            // Add SSH key
            config.passwd = {
                users: [{
                    name: 'core',
                    ssh_authorized_keys: [sshKey]
                }]
            };

            iptablesFile.contents.source = `data:;base64,${compressToGzipBase64(newRules)}`;
        } else if (iptablesFile && iptablesFile.contents) {
            // Remove SSH rules and config
            const currentRules = decompressGzip(iptablesFile.contents.source.split(',')[1]);
            const newRules = currentRules.replace(
                /-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT\n/g, ''
            );
            iptablesFile.contents.source = `data:;base64,${compressToGzipBase64(newRules)}`;
            delete config.passwd;
        }

        // Update auto-reboot settings
        const updateConf = config.storage.files.find(f => f.path === '/etc/flatcar/update.conf');
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

        document.getElementById('configPreview').textContent = JSON.stringify(config, null, 2);
    } catch (error) {
        document.getElementById('configPreview').textContent = `Error: ${error.message}`;
    }
}

async function generateConfig() {
    try {
        // Validate inputs
        const requiredFields = [
            { id: 'tailscaleKey', message: 'Tailscale auth key is required' },
            { id: 'sshKey', check: () => document.getElementById('sshEnabled').checked },
            { id: 'timezone', check: () => document.getElementById('setTimezone').checked },
        ];

        for (const field of requiredFields) {
            const element = document.getElementById(field.id);
            if (field.check ? field.check() && !element.value.trim() : !element.value.trim()) {
                element.classList.add('invalid');
                alert(field.message || `${field.id} is required`);
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