INSERT OR IGNORE INTO case_media (case_id, media_id, sort_order)
SELECT c.id, rm.media_id, rm.sort_order
FROM cases c
JOIN requirements r ON r.id = c.requirement_id
JOIN requirement_media rm ON rm.requirement_id = r.id
WHERE c.status = 'published' AND r.status = 'published';
--> statement-breakpoint
UPDATE cases
SET cover_media_id = coalesce(
  (SELECT r.cover_media_id
   FROM requirements r
   JOIN requirement_media rm ON rm.requirement_id = r.id AND rm.media_id = r.cover_media_id
   WHERE r.id = cases.requirement_id
   LIMIT 1),
  (SELECT rm.media_id FROM requirement_media rm
   WHERE rm.requirement_id = cases.requirement_id
   ORDER BY rm.sort_order, rm.media_id LIMIT 1)
)
WHERE cases.status = 'published'
  AND cases.requirement_id IS NOT NULL
  AND (cases.cover_media_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM case_media cm
    WHERE cm.case_id = cases.id AND cm.media_id = cases.cover_media_id
  ));
--> statement-breakpoint
ALTER TABLE `requirements` DROP COLUMN `share_consent`;
--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `status`;
