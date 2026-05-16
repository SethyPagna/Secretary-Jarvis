# HUD Setup Approval Flow

The HUD Settings panel can stage setup approvals without becoming a wall of setup text.

## Flow

1. Open the centered Jarvis orb.
2. Choose Settings.
3. Check the compact setup groups:
   - Needed Feature Downloads.
   - Future Scaling Models.
4. Expand one setup install card only when you want details.
5. Press Dry-run.
6. Jarvis calls `POST /api/setup/install-plans/:id/dry-run`.
7. The HUD shows a small result chip such as `requires_approval`.
8. The approval is recorded in the normal pending approval queue.

## Guarantees

- Dry-run buttons never launch installers.
- Dry-run buttons never download models.
- Dry-run buttons never read credentials.
- Risky setup actions are reviewed by policy before they can become real work.
- Full command previews and rollback notes remain collapsed unless you expand the card.

## Approval Summary

The Settings panel also shows a compact setup approval summary:

- current setup approval count.
- whether the setup lane is quiet or gated.
- the first pending setup approval title.

This keeps the HUD useful while preserving the deeper dashboard and audit log for full details.
