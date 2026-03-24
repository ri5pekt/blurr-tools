import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HOST = "31.220.56.146"
USER = "root"
KEY  = r"C:\Users\denis\.ssh\id_ed25519"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, key_filename=KEY, timeout=30)

_, out, _ = ssh.exec_command(
    "cd /var/www/blurr-tools && docker compose -f docker-compose.prod.yml logs api --tail=50",
    timeout=30
)
print("=== API LOGS ===")
print(out.read().decode("utf-8", errors="replace"))

_, out, _ = ssh.exec_command(
    "cd /var/www/blurr-tools && docker compose -f docker-compose.prod.yml logs worker --tail=30",
    timeout=30
)
print("=== WORKER LOGS ===")
print(out.read().decode("utf-8", errors="replace"))

ssh.close()
