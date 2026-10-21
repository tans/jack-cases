ALTER TABLE `requirements` ADD `publish_requested` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `requirements`
SET `publish_requested` = true
WHERE `status` = 'published'
   OR EXISTS (
     SELECT 1 FROM `cases`
     WHERE `cases`.`requirement_id` = `requirements`.`id`
       AND `cases`.`status` = 'published'
   );
