#!/usr/bin/env python3
"""Convert .doc → .docx via LibreOffice headless. Preserves table/font/page layout.

Usage: python3 doc_to_docx.py <input.doc> [output_dir]
       python3 doc_to_docx.py <input.doc> <output.docx>
"""
import sys
import shutil
import subprocess
from pathlib import Path

SOFFICE_CANDIDATES = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
    "/opt/homebrew/bin/soffice",
    "soffice",
]


def _platform_install_hint() -> str:
    """Return platform-specific install instructions for LibreOffice."""
    import platform
    sys_name = platform.system()
    skill_root = Path(__file__).resolve().parent.parent
    setup = skill_root / "setup.sh"
    lines = ["LibreOffice (soffice) not found.",
             "Required only for legacy .doc → .docx conversion.",
             "(.docx templates work without it.)",
             "",
             "Install:"]
    if sys_name == "Darwin":
        lines.append("  brew install --cask libreoffice")
    elif sys_name == "Linux":
        lines.append("  sudo apt-get install -y libreoffice          # Debian/Ubuntu")
        lines.append("  sudo dnf install -y libreoffice              # Fedora")
        lines.append("  sudo pacman -S --needed libreoffice-fresh    # Arch")
    else:
        lines.append("  See https://www.libreoffice.org/download/")
    lines.append("")
    lines.append("Or run the bundled setup script:")
    lines.append(f"  bash {setup} install")
    return "\n".join(lines)


def find_soffice() -> str:
    for path in SOFFICE_CANDIDATES:
        if shutil.which(path) or Path(path).exists():
            return path
    raise FileNotFoundError(_platform_install_hint())


def convert(input_path: Path, output: Path) -> Path:
    soffice = find_soffice()
    if output.is_dir() or not output.suffix:
        out_dir = output if output.is_dir() else output.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        cmd = [
            soffice,
            "--headless",
            "--convert-to",
            "docx",
            "--outdir",
            str(out_dir),
            str(input_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"soffice conversion failed:\n{result.stderr}")
        produced = out_dir / (input_path.stem + ".docx")
        if not produced.exists():
            raise RuntimeError(f"Expected output not found: {produced}")
        return produced

    out_dir = output.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        soffice,
        "--headless",
        "--convert-to",
        "docx",
        "--outdir",
        str(out_dir),
        str(input_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"soffice conversion failed:\n{result.stderr}")
    auto_name = out_dir / (input_path.stem + ".docx")
    if auto_name != output and auto_name.exists():
        auto_name.replace(output)
    return output


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    inp = Path(sys.argv[1]).expanduser().resolve()
    if not inp.exists():
        print(f"Input not found: {inp}", file=sys.stderr)
        sys.exit(2)
    if len(sys.argv) >= 3:
        out = Path(sys.argv[2]).expanduser().resolve()
    else:
        out = inp.with_suffix(".docx")
    produced = convert(inp, out)
    print(f"Converted: {produced}")


if __name__ == "__main__":
    main()
