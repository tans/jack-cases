CREATE TABLE `business_options` (
	`id` text PRIMARY KEY NOT NULL,
	`field` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_options_field_name` ON `business_options` (`field`,`name`);--> statement-breakpoint
ALTER TABLE `requirements` ADD `applicable_entities` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `requirements` ADD `circulation_types` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `requirements` ADD `business_modes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `requirements` ADD `subdomains` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `requirements` ADD `urgency` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `requirements` ADD `urgency_reason` text;--> statement-breakpoint
ALTER TABLE `requirements` ADD `value_assessment` text;
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('entity-manufacturer','applicableEntities','生产企业',0);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('entity-distributor','applicableEntities','流通企业',1);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('entity-hospital','applicableEntities','医院',2);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('entity-service','applicableEntities','服务机构',3);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('circulation-dealer','circulationTypes','经销',0);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('circulation-delivery','circulationTypes','配送',1);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('circulation-pending','circulationTypes','待确认',2);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('circulation-na','circulationTypes','不适用',3);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('mode-direct','businessModes','直销',0);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('mode-general','businessModes','总代',1);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('mode-provincial','businessModes','省级平台',2);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('mode-spd','businessModes','SPD',3);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('mode-service','businessModes','服务',4);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('subdomain-orthopedics','subdomains','骨科',0);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('subdomain-foot-ankle','subdomains','足踝',1);
--> statement-breakpoint
INSERT INTO business_options(id,field,name,sort_order) VALUES ('subdomain-trauma','subdomains','创伤',2);