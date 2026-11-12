# Microbe Wars workflow

The playable source lives in this folder. GitHub's `MarcoDSmit/microbe` repository is the upstream source for the Netlify deployment. Netlify builds the production site from `main`.

For each requested game change, check the current branch and working tree, run `node scripts/test.mjs` and `node scripts/build.mjs --netlify`, and commit the requested changes. Push the completed commit to `origin/main` unless the user asks to keep the work local. Keep unrelated edits out of the commit. Use an ordinary push and preserve remote history.

Verify the commit on GitHub after pushing. If Netlify deploy status is accessible, check whether that commit was published. If either step is blocked, report the status and what is needed to finish.
