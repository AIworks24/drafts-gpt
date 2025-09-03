#!/usr/bin/env bash
set -euo pipefail

echo "=== Normalizing repo structure ==="

# 0) Show current layout (fallback if 'tree' isn't installed)
echo "=== BEFORE: ls -R (top 3 levels) ==="
find . -maxdepth 3 -print | sed 's#^\./##' | sort

# 1) If a patch folder exists, merge it into root and remove
if [ -d "ai-email-agent-patch" ]; then
  echo "Merging ai-email-agent-patch/ into repo root..."
  # copy contents (including dotfiles) then delete
  cp -a ai-email-agent-patch/. .
  rm -rf ai-email-agent-patch
fi

# 2) Ensure canonical Next.js directories exist
mkdir -p apps/web/pages/api/auth
mkdir -p apps/web/pages/api/graph
mkdir -p apps/web/components
mkdir -p apps/web/lib
mkdir -p worker/src/jobs
mkdir -p worker/src/utils
mkdir -p supabase/migrations

move_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -e "$src" ]; then
    echo "Moving $src -> $dest"
    # If dest is a directory, move inside it; else rename
    if [ -d "$dest" ]; then
      # move contents inside existing dir
      if [ -d "$src" ]; then
        # move directory contents into destination
        shopt -s dotglob nullglob
        mv "$src"/* "$dest"/ 2>/dev/null || true
        shopt -u dotglob nullglob
        rmdir "$src" 2>/dev/null || true
      else
        mv "$src" "$dest"/
      fi
    else
      # ensure parent exists then move/rename
      mkdir -p "$(dirname "$dest")"
      mv "$src" "$dest"
    fi
  fi
}

# 3) Move any stray web bits into apps/web
move_if_exists "components" "apps/web/components"
move_if_exists "lib"        "apps/web/lib"
move_if_exists "api"        "apps/web/pages/api"     # sometimes created at root
move_if_exists "pages"      "apps/web/pages"         # sometimes created at root
move_if_exists "DraftPreview.tsx" "apps/web/components/DraftPreview.tsx"
move_if_exists "dashboard.tsx"    "apps/web/pages/dashboard.tsx"

# 4) If api subfolders ended up at root, make sure auth/graph live under apps/web/pages/api
move_if_exists "apps/web/api" "apps/web/pages/api"

# 5) Make sure index.tsx is under apps/web/pages
if [ -f "index.tsx" ]; then
  move_if_exists "index.tsx" "apps/web/pages/index.tsx"
fi

# 6) Worker layout sanity
# (if jobs/ and utils/ accidentally ended up under root worker/src, they'll stay; just ensure they exist)
mkdir -p worker/src/jobs worker/src/utils

# 7) Supabase migration dedupe:
# Keep supabase/migrations/01_init.sql and remove other duplicates.
dups=$(find . -type f -name "01_init.sql" | grep -v '^./supabase/migrations/01_init.sql' || true)
if [ -n "$dups" ]; then
  echo "Found duplicate 01_init.sql files:"
  echo "$dups"
  echo "Removing duplicates (keeping supabase/migrations/01_init.sql)..."
  echo "$dups" | xargs rm -f
fi

# 8) Remove now-empty stray dirs
find . -type d -empty -not -path "." -print -delete || true

echo "=== AFTER: ls -R (top 3 levels) ==="
find . -maxdepth 3 -print | sed 's#^\./##' | sort

echo "=== Done. Commit changes if it looks good. ==="
