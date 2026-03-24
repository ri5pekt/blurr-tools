"""Quick redeploy: git pull + rebuild API/worker + up"""
import paramiko, sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST = "31.220.56.146"
USER = "root"
KEY  = r"C:\Users\denis\.ssh\id_ed25519"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, key_filename=KEY, timeout=30)

def run(cmd, timeout=300, label=None):
    if label:
        print(f"\n>>> {label}")
    print(f"$ {cmd[:120]}")
    _, out, err = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
    output = out.read().decode("utf-8", errors="replace").strip()
    if output:
        print(output)
    ec = out.channel.recv_exit_status()
    if ec != 0:
        print(f"[exit {ec}] {err.read().decode('utf-8', errors='replace').strip()}")
    return ec

run("git -C /var/www/blurr-tools pull origin main", timeout=60, label="git pull")
run("cd /var/www/blurr-tools && docker compose -f docker-compose.prod.yml build api worker", timeout=600, label="Build api + worker")
run("cd /var/www/blurr-tools && docker compose -f docker-compose.prod.yml up -d --remove-orphans", timeout=60, label="Up")

print("\nWaiting for API health...")
for i in range(24):
    time.sleep(5)
    _, out, _ = ssh.exec_command("curl -sf http://127.0.0.1:3010/api/health && echo OK || echo WAITING")
    r = out.read().decode().strip()
    print(f"  [{i+1}] {r}")
    if r == "OK":
        break

run("cd /var/www/blurr-tools && docker compose -f docker-compose.prod.yml ps", label="Status")

print("\nSeed...")
run('cd /var/www/blurr-tools && docker compose -f docker-compose.prod.yml exec -T api node -e "import(\'./apps/api/dist/seed.js\')"', timeout=60, label="Seed")

run("curl -sk https://blurr-tools.cloud/api/health", label="Live check")

ssh.close()
print("\nDone.")
