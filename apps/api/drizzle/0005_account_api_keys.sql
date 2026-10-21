UPDATE `api_keys` SET `scopes` = NULL, `expires_at` = NULL;
--> statement-breakpoint
UPDATE `api_keys` SET `name` = 'API key' WHERE `name` IN ('Agent skill', 'Taxonomy skill', 'Admin skill');
