from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
from threading import Thread

import pytest

from scripts.verify_backend import VerificationError, check_api_health, check_git_files


@pytest.fixture
def git_checkout(tmp_path, monkeypatch):
    repo = tmp_path / "Scanity Project" / "Scanity"
    (repo / "BackEnd").mkdir(parents=True)
    source = Path(__file__).resolve().parents[2]
    shutil.copyfile(source / ".gitignore", repo / ".gitignore")
    shutil.copyfile(source / "BackEnd" / ".env.example", repo / "BackEnd" / ".env.example")
    # Keep each test independent of a developer's global Git ignores/templates.
    empty_config = tmp_path / "empty-git-config"
    empty_config.write_text("")
    empty_template = tmp_path / "empty-git-template"
    empty_template.mkdir()
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(empty_config))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.delenv("GIT_INDEX_FILE", raising=False)
    subprocess.run(["git", "init", "--quiet", f"--template={empty_template}", str(repo)], check=True, capture_output=True)
    return repo


def test_git_verifier_accepts_ignored_local_files_and_a_trackable_template(git_checkout):
    (git_checkout / "BackEnd" / ".env").write_text("SECRET_KEY=test-only-canary\n")
    assert len(check_git_files(git_checkout)) == 2


def test_git_verifier_detects_secrets_already_tracked_despite_ignore_rules(git_checkout):
    (git_checkout / "BackEnd" / ".env").write_text("SECRET_KEY=test-only-canary\n")
    subprocess.run(["git", "-C", str(git_checkout), "add", "-f", "BackEnd/.env"], check=True, capture_output=True)
    with pytest.raises(VerificationError, match="still tracks ignored files"):
        check_git_files(git_checkout)


def test_git_verifier_detects_a_missing_ignore_rule(git_checkout):
    path = git_checkout / ".gitignore"
    path.write_text(path.read_text().replace(".venv/\n", ""))
    with pytest.raises(VerificationError, match="exclusions are incomplete"):
        check_git_files(git_checkout)


def test_git_verifier_detects_an_accidentally_ignored_template(git_checkout):
    path = git_checkout / ".gitignore"
    path.write_text(path.read_text().replace("!.env.example\n", ""))
    with pytest.raises(VerificationError, match=".env.example is ignored"):
        check_git_files(git_checkout)


@pytest.mark.parametrize("status,body,error", [
    (200, b'{"status":"ok","database":"postgresql"}', None),
    (200, b'{"status":"ok","database":"sqlite"}', "not reporting PostgreSQL"),
    (503, b'credential-canary', "HTTP 503"),
    (404, b'credential-canary', "HTTP 404"),
    (200, b'credential-canary', "valid JSON"),
    (200, b'[]', "healthy database connection"),
])
def test_api_verification_over_http(status, body, error):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            assert self.path == "/health/db"
            self.send_response(status)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_port}/health/db"
        if error:
            with pytest.raises(VerificationError, match=error) as captured:
                check_api_health(url)
            assert "credential-canary" not in str(captured.value)
        else:
            assert "PostgreSQL query" in check_api_health(url)[0]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
