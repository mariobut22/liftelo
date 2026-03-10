-- MySQL dump 10.13  Distrib 9.5.0, for macos14.8 (x86_64)
--
-- Host: localhost    Database: liftelo
-- ------------------------------------------------------
-- Server version	9.5.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'b268f972-eed8-11f0-b3dc-54d42b5a423d:1-5044';

--
-- Table structure for table `app_settings`
--

DROP TABLE IF EXISTS `app_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_timeout_hours` int DEFAULT '720',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `email_enabled` tinyint(1) DEFAULT '0',
  `smtp_host` varchar(255) DEFAULT NULL,
  `smtp_port` int DEFAULT NULL,
  `smtp_user` varchar(255) DEFAULT NULL,
  `smtp_pass` varchar(255) DEFAULT NULL,
  `smtp_from` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `app_settings`
--

LOCK TABLES `app_settings` WRITE;
/*!40000 ALTER TABLE `app_settings` DISABLE KEYS */;
INSERT INTO `app_settings` VALUES (1,720,'2026-02-15 18:41:46',1,'smtp.gmail.com',587,'your@email.com','app_password_here','Liftelo <your@email.com>');
/*!40000 ALTER TABLE `app_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `action` varchar(255) NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_user` (`user_id`),
  KEY `idx_audit_logs_company` (`company_id`),
  KEY `idx_audit_logs_action` (`action`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,1,1,'login','{\"ip\": \"::1\"}','2026-02-20 00:02:06'),(2,1,1,'login','{\"ip\": \"::1\"}','2026-02-20 00:02:35'),(3,1,1,'login','{\"ip\": \"::1\"}','2026-02-20 00:09:26'),(4,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 14:41:03'),(5,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 14:41:15'),(6,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 14:46:24'),(7,7,NULL,'login','{\"ip\": \"::1\"}','2026-02-22 14:47:07'),(8,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 15:21:12'),(9,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 15:26:14'),(10,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 16:05:51'),(11,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 16:06:27'),(12,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 16:16:18'),(13,7,NULL,'login','{\"ip\": \"::1\"}','2026-02-22 16:16:36'),(14,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 16:30:51'),(15,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 16:37:08'),(16,1,2,'switch_company','{\"ip\": \"::1\"}','2026-02-22 16:54:26'),(17,1,1,'switch_company','{\"ip\": \"::1\"}','2026-02-22 16:54:29'),(18,1,1,'login','{\"ip\": \"::1\"}','2026-02-22 17:42:16'),(19,1,1,'invite_user','{\"role\": \"admin\", \"email\": \"mario.butkovic@yahoo.com\"}','2026-02-22 17:51:48'),(20,1,1,'invite_user','{\"role\": \"admin\", \"email\": \"mario.butkovic22@gmail.com\"}','2026-02-22 17:52:03'),(21,1,1,'login','{\"ip\": \"::1\"}','2026-02-23 21:27:25'),(22,1,1,'login','{\"ip\": \"::1\"}','2026-02-25 00:02:06'),(23,1,2,'switch_company','{\"ip\": \"::1\"}','2026-02-25 00:16:17'),(24,1,1,'switch_company','{\"ip\": \"::1\"}','2026-02-25 00:21:24'),(25,1,1,'login','{\"ip\": \"::1\"}','2026-02-26 21:08:26'),(26,1,1,'login','{\"ip\": \"::1\"}','2026-02-27 23:09:38'),(27,1,1,'login','{\"ip\": \"::1\"}','2026-03-07 15:12:51'),(28,1,1,'login','{\"ip\": \"::1\"}','2026-03-08 11:13:52'),(29,1,1,'login','{\"ip\": \"::1\"}','2026-03-08 11:14:08'),(30,1,1,'login','{\"ip\": \"::1\"}','2026-03-08 11:20:01'),(31,1,1,'login','{\"ip\": \"::1\"}','2026-03-09 13:40:43');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `companies`
--

DROP TABLE IF EXISTS `companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `companies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `logo_path` varchar(255) DEFAULT NULL,
  `subscription_status` enum('active','trial','suspended') DEFAULT 'active',
  `subscription_plan` varchar(50) DEFAULT 'basic',
  `subscription_expires_at` datetime DEFAULT NULL,
  `default_language` varchar(5) NOT NULL DEFAULT 'hr',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `companies`
--

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
INSERT INTO `companies` VALUES (1,'Rijeka-dizalo d.o.o.','2026-02-06 11:27:38','/uploads/company-logos/1-1771195832164.png','active','basic',NULL,'hr'),(2,'Technique d.o.o.','2026-02-19 21:19:30','/uploads/company-logos/2-1771536176511.png','active','basic',NULL,'hr');
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `elevators`
--

DROP TABLE IF EXISTS `elevators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `elevators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` int NOT NULL,
  `label` varchar(100) NOT NULL,
  `serial_number` varchar(100) DEFAULT NULL,
  `control_group_type` varchar(100) DEFAULT NULL,
  `cabin_door_type` varchar(100) DEFAULT NULL,
  `lock_type` varchar(100) DEFAULT NULL,
  `machine_room_key` varchar(100) DEFAULT NULL,
  `comment` text,
  `status` varchar(50) DEFAULT 'SVE RADI',
  `company_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `location_id` (`location_id`),
  KEY `idx_elevators_company_id` (`company_id`),
  CONSTRAINT `elevators_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_elevators_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `elevators`
--

LOCK TABLES `elevators` WRITE;
/*!40000 ALTER TABLE `elevators` DISABLE KEYS */;
INSERT INTO `elevators` VALUES (2,76,'D1',NULL,NULL,NULL,NULL,NULL,NULL,'SVE RADI',1),(5,30,'D1 (parni / even)','X562388','BMC3000','Automatska','ELBAK','Master key','Kljuc je na kanalici','SVE RADI',1),(6,30,'D2 (neparni / odd)',NULL,NULL,NULL,NULL,NULL,NULL,'SVE RADI',1),(7,18,'D1 - parni','xxxxxx','MLC',NULL,'ELBAK',NULL,NULL,'SVE RADI',1);
/*!40000 ALTER TABLE `elevators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_outbox`
--

DROP TABLE IF EXISTS `email_outbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_outbox` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `to_email` varchar(255) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `html` longtext NOT NULL,
  `status` enum('pending','sending','sent','failed') DEFAULT 'pending',
  `attempts` int DEFAULT '0',
  `next_attempt_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `locked_at` datetime DEFAULT NULL,
  `locked_by` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `sent_at` datetime DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `text` text,
  `type` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `status` (`status`),
  KEY `next_attempt_at` (`next_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_outbox`
--

LOCK TABLES `email_outbox` WRITE;
/*!40000 ALTER TABLE `email_outbox` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_outbox` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `intervention_items`
--

DROP TABLE IF EXISTS `intervention_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `intervention_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `intervention_id` int NOT NULL,
  `elevator_label` varchar(255) NOT NULL,
  `status` varchar(100) DEFAULT NULL,
  `comment` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_intervention_elevator` (`intervention_id`,`elevator_label`),
  KEY `idx_intervention_items_intervention` (`intervention_id`),
  KEY `idx_intervention_items_company_id` (`company_id`),
  CONSTRAINT `fk_intervention_items_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_intervention_items_intervention` FOREIGN KEY (`intervention_id`) REFERENCES `interventions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `intervention_items`
--

LOCK TABLES `intervention_items` WRITE;
/*!40000 ALTER TABLE `intervention_items` DISABLE KEYS */;
INSERT INTO `intervention_items` VALUES (1,25,'D1 (parni / even)','O.K.',NULL,'2026-02-18 21:27:53',1),(2,25,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:27:53',1),(3,26,'D1 (parni / even)','O.K.',NULL,'2026-02-19 13:57:39',1),(4,26,'D2 (neparni / odd)','O.K.',NULL,'2026-02-19 13:57:39',1);
/*!40000 ALTER TABLE `intervention_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interventions`
--

DROP TABLE IF EXISTS `interventions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interventions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date` datetime NOT NULL,
  `type` enum('POZIV','INICIJATIVA') DEFAULT 'POZIV',
  `technician` varchar(100) DEFAULT NULL,
  `description` text,
  `resolved` tinyint(1) DEFAULT '0',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(100) DEFAULT 'O.K.',
  `pdf_path` varchar(255) DEFAULT NULL,
  `document_name` varchar(255) DEFAULT NULL,
  `location_id` int DEFAULT NULL,
  `second_technician` varchar(255) DEFAULT NULL,
  `uploaded_files` text,
  `company_id` int NOT NULL,
  `technician_signature_path` varchar(255) DEFAULT NULL,
  `client_signature_path` varchar(255) DEFAULT NULL,
  `signed_by_user_id` int DEFAULT NULL,
  `signed_at` datetime DEFAULT NULL,
  `signature_ip` varchar(100) DEFAULT NULL,
  `signature_status` enum('draft','signed') DEFAULT 'draft',
  `document_hash` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_interventions_company_id` (`company_id`),
  CONSTRAINT `fk_interventions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interventions`
--

LOCK TABLES `interventions` WRITE;
/*!40000 ALTER TABLE `interventions` DISABLE KEYS */;
INSERT INTO `interventions` VALUES (3,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:41:51','NIJE RIJEŠENO','/uploads/interventions/Fc2-INTERVENCIJA-26.01.2026-6455.pdf','FČ2-INTERVENCIJA-26.01.2026-6455',13,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(4,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:42:07','NIJE RIJEŠENO','/uploads/interventions/DG12-INTERVENCIJA-26.01.2026-6148.pdf','DG12-INTERVENCIJA-26.01.2026-6148',9,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(5,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:47:32','NIJE RIJEŠENO','/uploads/interventions/M9-INTERVENCIJA-26.01.2026-1771.pdf','M9-INTERVENCIJA-26.01.2026-1771',14,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(6,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:49:17','NIJE RIJEŠENO','/uploads/interventions/sXD15-INTERVENCIJA-26.01.2026-6939.pdf','ŠXD15-INTERVENCIJA-26.01.2026-6939',33,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(7,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 13:58:07','NIJE RIJEŠENO','/uploads/interventions/DG12-INTERVENCIJA-26.01.2026-1743.pdf','DG12-INTERVENCIJA-26.01.2026-1743',9,'Rezervni Admin','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(8,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 14:04:57','NIJE RIJEŠENO','/pdfs/SK6-INTERVENCIJA-26.01.2026-5239.pdf','SK6-INTERVENCIJA-26.01.2026-5239',36,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(9,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 14:08:04','NIJE RIJEŠENO','/pdfs/Ds24-INTERVENCIJA-26.01.2026-7774.pdf','DŠ24-INTERVENCIJA-26.01.2026-7774',11,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(10,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 14:15:49','NIJE RIJEŠENO','/pdfs/F2-INTERVENCIJA-26.01.2026-9156.pdf','F2-INTERVENCIJA-26.01.2026-9156',59,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(11,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-28 09:28:56','NIJE RIJEŠENO','/pdfs/LRD-INTERVENCIJA-28.01.2026-6651.pdf','LRD-INTERVENCIJA-28.01.2026-6651',82,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(12,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-28 09:37:27','NIJE RIJEŠENO','/pdfs/Z9-INTERVENCIJA-28.01.2026-8110.pdf','Z9-INTERVENCIJA-28.01.2026-8110',24,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(13,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'gashfhasfhasfhas','2026-01-28 09:41:01','NIJE RIJEŠENO','/pdfs/Fc2-INTERVENCIJA-28.01.2026-1515.pdf','FČ2-INTERVENCIJA-28.01.2026-1515',13,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(14,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'agshsahasfha','2026-01-28 09:45:30','NIJE RIJEŠENO','/pdfs/FK6-INTERVENCIJA-28.01.2026-4993.pdf','FK6-INTERVENCIJA-28.01.2026-4993',51,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(15,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'aagsHGASHASH','2026-01-28 10:04:26','NIJE RIJEŠENO','/pdfs/DG12-INTERVENCIJA-28.01.2026-7720.pdf','DG12-INTERVENCIJA-28.01.2026-7720',9,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(16,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'aag','2026-01-28 10:06:29','NIJE RIJEŠENO','/pdfs/Ds22-INTERVENCIJA-28.01.2026-6096.pdf','DŠ22-INTERVENCIJA-28.01.2026-6096',10,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(17,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'aagagagag','2026-01-28 10:48:41','NIJE RIJEŠENO','/pdfs/FK6-INTERVENCIJA-28.01.2026-9614.pdf','FK6-INTERVENCIJA-28.01.2026-9614',51,'null','/uploads/interventions/18dc85cb38bfc7f3cb8a01ae947c92e4, /uploads/interventions/b4d4b75dbcc44a5af094829e2ddc971d',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(18,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'agagag','2026-01-28 10:50:37','NIJE RIJEŠENO','/pdfs/DG12-INTERVENCIJA-28.01.2026-1682.pdf','DG12-INTERVENCIJA-28.01.2026-1682',9,'null','/uploads/interventions/c94f47d95697aec179491a8282635eb8, /uploads/interventions/09933c39b9df7995d5482d196a4df60f',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(19,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'agag','2026-01-28 10:51:32','NIJE RIJEŠENO','/pdfs/Fc2-INTERVENCIJA-28.01.2026-5945.pdf','FČ2-INTERVENCIJA-28.01.2026-5945',13,'null','/uploads/interventions/1769597491828-633204395.png, /uploads/interventions/1769597491828-668471789.png',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(20,'2026-01-29 00:00:00','POZIV','Administrator',NULL,0,'ggggggggg','2026-01-29 12:13:00','NIJE RIJEŠENO','/pdfs/M14-INTERVENCIJA-29.01.2026-8283.pdf','M14-INTERVENCIJA-29.01.2026-8283',35,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(21,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'','2026-01-31 22:38:44','Potreban popravak - Dizalo u funkciji','/pdfs/NK4-INTERVENCIJA-31.01.2026-9816.pdf','NK4-INTERVENCIJA-31.01.2026-9816',30,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(22,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'tw4tw','2026-01-31 22:38:53','Potreban popravak - Dizalo u funkciji','/pdfs/NK4-INTERVENCIJA-31.01.2026-2484.pdf','NK4-INTERVENCIJA-31.01.2026-2484',30,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(23,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'tw4tw','2026-01-31 22:39:04','Potreban popravak - Dizalo nije u funkciji','/pdfs/NK4-INTERVENCIJA-31.01.2026-1473.pdf','NK4-INTERVENCIJA-31.01.2026-1473',30,'Administrator','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(24,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'','2026-01-31 22:47:02','O.K.','/pdfs/NK4-INTERVENCIJA-31.01.2026-2236.pdf','NK4-INTERVENCIJA-31.01.2026-2236',30,'null','',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL),(25,'2026-02-18 00:00:00','POZIV','admin',NULL,0,'hoihoilh','2026-02-18 21:27:53','O.K.','/pdfs/NK4-INTERVENCIJA-18.02.2026-9642.pdf','NK4-INTERVENCIJA-18.02.2026-9642',30,NULL,'',1,'/uploads/signatures/1-intervention-25-tech-1771450073971.png','/uploads/signatures/1-intervention-25-client-1771450073971.png',1,'2026-02-18 22:27:53','::1','signed','72ea4ddebc78135ed17d47cc0b66d54ae04eab9811aa41dc74aed5ed229c2c54'),(26,'2026-02-19 00:00:00','POZIV','admin',NULL,0,'tetetetetet','2026-02-19 13:57:39','O.K.','/pdfs/NK4-INTERVENCIJA-19.02.2026-5654.pdf','NK4-INTERVENCIJA-19.02.2026-5654',30,NULL,'',1,'/uploads/signatures/1-intervention-26-tech-1771509460084.png','/uploads/signatures/1-intervention-26-client-1771509460084.png',1,'2026-02-19 14:57:40','::1','signed','58ac70b686b9de8075141b24db7759a0f6a4fb4143b6ad409cc337348d1c8d60');
/*!40000 ALTER TABLE `interventions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invitations`
--

DROP TABLE IF EXISTS `invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invitations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `company_id` int NOT NULL,
  `role` enum('admin','technician','viewer') NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `status` enum('pending','accepted','expired') DEFAULT 'pending',
  `invited_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invitations_email` (`email`),
  KEY `idx_invitations_company` (`company_id`),
  KEY `idx_invitations_token` (`token`),
  KEY `idx_invitations_invited_by` (`invited_by`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invitations`
--

LOCK TABLES `invitations` WRITE;
/*!40000 ALTER TABLE `invitations` DISABLE KEYS */;
INSERT INTO `invitations` VALUES (1,'mario.butkovic@yahoo.com',1,'admin','63a57eaf3e44886c1a67cab3ebc6f5158173b2ba21f2587a21656ef0d90a2d93','2026-02-24 17:51:48','pending',1,'2026-02-22 17:51:48'),(2,'mario.butkovic22@gmail.com',1,'admin','cb6dd0dc4f48af2591134a20ace96e6946c85a7717905260163f65d4f74f6dc2','2026-02-24 17:52:03','pending',1,'2026-02-22 17:52:03');
/*!40000 ALTER TABLE `invitations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `location_monthly_services`
--

DROP TABLE IF EXISTS `location_monthly_services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `location_monthly_services` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `location_id` int NOT NULL,
  `year` int NOT NULL,
  `month` int NOT NULL,
  `service_date` date DEFAULT NULL,
  `invoice_status` enum('not_invoiced','invoiced') NOT NULL DEFAULT 'not_invoiced',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_location_year_month` (`company_id`,`location_id`,`year`,`month`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `location_monthly_services`
--

LOCK TABLES `location_monthly_services` WRITE;
/*!40000 ALTER TABLE `location_monthly_services` DISABLE KEYS */;
INSERT INTO `location_monthly_services` VALUES (1,1,30,2026,2,'2026-02-18','not_invoiced','2026-02-17 20:25:52','2026-02-18 22:01:33'),(2,1,40,2026,2,'2026-02-14','not_invoiced','2026-02-17 20:40:08','2026-02-17 20:40:08'),(3,1,74,2026,2,'2026-02-15','invoiced','2026-02-17 20:40:30','2026-02-17 21:00:35');
/*!40000 ALTER TABLE `location_monthly_services` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `locations`
--

DROP TABLE IF EXISTS `locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `notes` text,
  `company_id` int NOT NULL,
  `rms_frequency` int NOT NULL DEFAULT '1',
  `upravitelj` varchar(255) DEFAULT NULL,
  `kljuc_strojarnice` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_locations_company_id` (`company_id`),
  CONSTRAINT `fk_locations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=90 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `locations`
--

LOCK TABLES `locations` WRITE;
/*!40000 ALTER TABLE `locations` DISABLE KEYS */;
INSERT INTO `locations` VALUES (9,'D. GODINE 12','Ul. Danijela Godine 12, 51000, Rijeka, Croatia',45.32372470,14.45977360,NULL,NULL,NULL,1,1,NULL,NULL),(10,'D. ŠČITARA 22','Drage Šćitara 22, Rijeka',45.32629210,14.46293270,'','','',1,1,NULL,NULL),(11,'D. ŠĆITARA 24','Drage Sćitara 24/d, Rijeka',45.32641250,14.46274840,'','','',1,1,NULL,NULL),(12,'D. ŠĆITARA 26','Drage Šćitara 26/d, Rijeka',45.32652830,14.46255770,'','','',1,1,NULL,NULL),(13,'F. ČANDEKA 23b','Franje Čandeka 23B, 51000, Rijeka, Croatia',45.33922420,14.41425250,NULL,NULL,NULL,1,1,NULL,NULL),(14,'MEDOVIĆEVA 9','Medovićeva ul. 9, 51000, Rijeka, Croatia',45.34424640,14.39795210,NULL,NULL,NULL,1,1,NULL,NULL),(15,'MEDOVIĆEVA 29','Medovićeva ul. 29, 51000, Rijeka, Croatia',45.34541900,14.39454540,NULL,NULL,NULL,1,1,NULL,NULL),(16,'B. KAŠIĆA 24','Bartola Kašića 24, Rijeka',45.35393890,14.36714350,'','','',1,1,NULL,NULL),(17,'KREŠIMIROVA 10','Krešimirova ul. 10, 51000, Rijeka, Croatia',45.32928690,14.43516020,NULL,NULL,NULL,1,1,NULL,NULL),(18,'N. KATUNARA 12','Nike Katunara 12, 51000 Rijeka',45.32623340,14.46090380,NULL,NULL,NULL,1,1,NULL,NULL),(19,'J. P. KAMOVA 17','Ul. Janka Polića Kamova 17, 51000, Rijeka, Croatia',45.32114640,14.46239900,NULL,NULL,NULL,1,1,NULL,NULL),(20,'J. P. KAMOVA 37a','Ul. Janka Polića Kamova 37a, 51000, Rijeka, Croatia',45.32028430,14.46411000,NULL,NULL,NULL,1,1,NULL,NULL),(21,'A. KOVAČIĆA 17','Ul. Ante Kovačića 17, Rijeka',45.33152290,14.44756450,'','','',1,1,NULL,NULL),(22,'A. BENUSSI 8','A. BENUSSI 8, Rijeka',45.32706310,14.44217600,'','','',1,1,NULL,NULL),(23,'I. ČIKOVIĆA BELOG 8a','I.Ćikovića Belog, 51000, Rijeka, Croatia',45.34578200,14.38441200,NULL,NULL,NULL,1,1,NULL,NULL),(24,'ZAGREBAČKA 9','Zagrebačka 9, Rijeka',45.32706310,14.44217600,'','','',1,1,NULL,NULL),(25,'J. P. KAMOVA 44/a','Ul. Janka Polića Kamova 44A, 51000, Rijeka, Croatia',45.32018970,14.46360730,NULL,NULL,NULL,1,1,NULL,NULL),(26,'S. KRAUTZEKA 92a','Slavka Krautzeka 92 A, 51000, Rijeka, Croatia',45.32459050,14.46721070,NULL,NULL,NULL,1,1,NULL,NULL),(27,'S. KRAUTZEKA 92b','Slavka Krautzeka 92B, 51000, Rijeka, Croatia',45.32446330,14.46739390,NULL,NULL,NULL,1,1,NULL,NULL),(28,'S. KRAUTZEKA 92c','Slavka Krautzeka 92C, 51000, Rijeka, Croatia',45.32434490,14.46757350,NULL,NULL,NULL,1,1,NULL,NULL),(29,'SIMONETTIEVA 5','Simonettieva ul. 5, 51000, Rijeka, Croatia',45.34151330,14.40239200,NULL,NULL,NULL,1,1,NULL,NULL),(30,'N. KATUNARA 4','Nike Katunara 4, Rijeka',45.32510670,14.46331710,'Ivan Ivić','099 123 4566','Čuvati se galebova',1,1,NULL,NULL),(31,'STROSSMAYEROVA 15','Strossmayerova 15, Rijeka',45.32491580,14.45297730,'','','',1,1,NULL,NULL),(32,'STROSSMAYEROVA 13','Strossmayerova 13, Rijeka',45.32497520,14.45271240,'','','',1,1,NULL,NULL),(33,'ŠET. XIII DIVIZIJE 15','Šetalište XIII divizije 15, 51000, Rijeka, Croatia',45.32344190,14.45672060,NULL,NULL,NULL,1,1,NULL,NULL),(34,'N. KATUNARA 13','Nike Katunara 13, Rijeka',45.32561670,14.46163760,'','','',1,1,NULL,NULL),(35,'MAROHNIĆEVA 14','Marohnićeva 14, 51000, Rijeka, Croatia',45.32551100,14.46548900,NULL,NULL,NULL,1,1,NULL,NULL),(36,'S. KRAUTZEKA 66B','Slavka Krautzeka 66B, 51000, Rijeka, Croatia',45.32650140,14.46487040,NULL,NULL,NULL,1,1,NULL,NULL),(37,'S. KRAUTZEKA 66C','Slavka Krautzeka 66C, 51000, Rijeka, Croatia',45.32626510,14.46484380,NULL,NULL,NULL,1,1,NULL,NULL),(38,'S. KRAUTZEKA 66D','Slavka Krautzeka 66D, 51000, Rijeka, Croatia',45.32621100,14.46483750,NULL,NULL,NULL,1,1,NULL,NULL),(39,'LAGINJINA 19','Laginjina ul. 19, 51000, Rijeka, Croatia',45.33222230,14.43934530,NULL,NULL,NULL,1,1,NULL,NULL),(40,'DEŽMANOVA 6','Ul. Ivana Dežmana 6, Rijeka',45.32914980,14.44134890,'','','',1,1,NULL,NULL),(41,'ŠIBENSKA 3','Šibenska ul. 3, Rijeka',45.33938610,14.40911510,'','','',1,1,NULL,NULL),(42,'B.KAŠIĆA 20','Bartola Kašića 20, Rijeka',45.35349700,14.36798900,'','','',1,1,NULL,NULL),(43,'MIĆI VOLJAK 4','Ul. Mići Voljak 4, 51000, Rijeka, Croatia',45.33298000,14.44055860,NULL,NULL,NULL,1,1,NULL,NULL),(44,'RASTOČINE 4','Rastočine ul. 4, 51000, Rijeka, Croatia',45.33929180,14.43178950,NULL,NULL,NULL,1,1,NULL,NULL),(45,'M. ŠPILERA 1','Ul. Marija Špilera 1, 51000, Rijeka, Croatia',45.34135230,14.41887000,NULL,NULL,NULL,1,1,NULL,NULL),(46,'N.KATUNARA 6','Nike Katunara 6, Rijeka',45.32543420,14.46284830,'','','',1,1,NULL,NULL),(47,'A. BENUSSI 2','A. BENUSSI 2, Rijeka',45.32706310,14.44217600,'','','',1,1,NULL,NULL),(48,'G.CARABINO 7','G.Carabino, 51000, Rijeka, Croatia',45.34180700,14.40346200,NULL,NULL,NULL,1,1,NULL,NULL),(49,'HEGEDUŠIĆEVA 19','Hegedušićeva ul. 19, Rijeka',45.34285010,14.39404780,'','','',1,1,NULL,NULL),(50,'M. ALBAHARI 2','Ul. Moše Albaharija, 51000, Rijeka, Croatia',45.33154230,14.43622050,NULL,NULL,NULL,1,1,NULL,NULL),(51,'F. KURELCA 6','Ul. Frana Kurelca 6, Rijeka',45.32881690,14.44102540,'','','',1,1,NULL,NULL),(52,'I. DEŽMANA 8','Ul. Ivana Dežmana 8, 51000, Rijeka, Croatia',45.32929800,14.44107880,NULL,NULL,NULL,1,1,NULL,NULL),(53,'A. MEDULIĆA 6 i 8','Ul. Andrije Medulića 6-8, Rijeka',45.32756490,14.44409810,'','','',1,1,NULL,NULL),(54,'Z.KUČIĆA 39','Ul. dr. Zdravka Kučića 39, 51000, Rijeka, Croatia',45.32027770,14.47999790,NULL,NULL,NULL,1,1,NULL,NULL),(55,'MEDOVIĆEVA 15','Medovićeva ul. 15, 51000, Rijeka, Croatia',45.34453460,14.39708900,NULL,NULL,NULL,1,1,NULL,NULL),(56,'LAGINJINA 8a','Laginjina ul. 8, Rijeka',45.33099170,14.44171640,'','','',1,1,NULL,NULL),(57,'MEDOVIĆEVA 17','Medovićeva ul. 17, 51000, Rijeka, Croatia',45.34455990,14.39684660,NULL,NULL,NULL,1,1,NULL,NULL),(58,'KREŠIMIROVA 34','Krešimirova ul. 34, 51000, Rijeka, Croatia',45.33070160,14.43012550,NULL,NULL,NULL,1,1,NULL,NULL),(59,'F.LA.GUARDIA 2','F. la Guardia 2, Rijeka',45.33029180,14.43521970,'','','',1,1,NULL,NULL),(60,'MARINA JAKOMINIĆA 3','Ul. Marina Jakominića 3, 51000, Rijeka, Croatia',45.34421930,14.37178960,NULL,NULL,NULL,1,1,NULL,NULL),(61,'MARINA JAKOMINIĆA 3A','Ul. Marina Jakominića 3A, 51000, Rijeka, Croatia',45.34424580,14.37180300,NULL,NULL,NULL,1,1,NULL,NULL),(62,'F.LA.GUARDIA 13','F. la Guardia 13, Rijeka',45.33029180,14.43521970,'','','',1,1,NULL,NULL),(63,'TIZIANOVA 35','Tizianova ul. 35, 51000, Rijeka, Croatia',45.33660510,14.43316970,NULL,NULL,NULL,1,1,NULL,NULL),(64,'SIMONETTIEVA 1','Simonettieva ul. 1, 51000, Rijeka, Croatia',45.34142050,14.40186500,NULL,NULL,NULL,1,1,NULL,NULL),(65,'KREŠIMIROVA 58','Krešimirova ul. 58, 51000, Rijeka, Croatia',45.33284240,14.42411470,NULL,NULL,NULL,1,1,NULL,NULL),(66,'HRV. CRVENI KRIŽ','Brajdica 5, 51000, Rijeka, Croatia',45.32394770,14.44631740,NULL,NULL,NULL,1,1,NULL,NULL),(67,'GPZ','Ul. Đure Šporera 8, 51000, Rijeka, Croatia',45.32731840,14.44458730,NULL,NULL,NULL,1,1,NULL,NULL),(68,'VOD. I KANALIZACIJA','Dolac 14, Rijeka',45.32899000,14.43916920,'','','',1,1,NULL,NULL),(69,'JH SPORT','Brajdica 5/1, 51000, Rijeka, Croatia',45.32396330,14.45432260,NULL,NULL,NULL,1,1,NULL,NULL),(70,'KD KOZALA d.o.o.','Ul. Braće Hlača 2/a, 51000, Rijeka, Croatia',45.35853930,14.42317190,NULL,NULL,NULL,1,1,NULL,NULL),(71,'ROBNA KUĆA RI - ADRIA GRUPA d.o.o.','Riva 6, Rijeka',45.32639470,14.44186170,'','','',1,1,NULL,NULL),(72,'FAST FORWARD d.o.o.','Dražice 123, Rijeka',45.34988830,14.37305480,'','','',1,1,NULL,NULL),(73,'JAVNI BILJ. PANJKOVIĆ','Ul. Ante Starčevića 4, Rijeka',45.32599910,14.44514760,'','','',1,1,NULL,NULL),(74,'3 MAJ BRODOG-dizalica','Liburnijska ul. 3, 51000, Rijeka, Croatia',45.33893850,14.39494540,NULL,NULL,NULL,1,1,NULL,NULL),(75,'PSIH.BOLNICA LOPAČA','Lopača 11, 51218, Dražice, Croatia',45.37797380,14.44101200,NULL,NULL,NULL,1,1,NULL,NULL),(76,'M – BROS. j.d.o.o.','53B, 51500, Skrbčići, Croatia',45.04917620,14.49211390,'','','',1,1,NULL,NULL),(77,'DELTA TREND d.o.o.','Bjanižov 3, 51511, Omišalj, Croatia',45.21431880,14.55573850,NULL,NULL,NULL,1,1,NULL,NULL),(78,'DJ. VRTIĆ KASTAV','Skalini Istarskog Tabora 1, 51215, Kastav, Croatia',45.37210940,14.34723400,NULL,NULL,NULL,1,1,NULL,NULL),(79,'PSC LOVORKA','Rujevica ul. 6, 51000, Rijeka, Croatia',45.34719120,14.40521420,NULL,NULL,NULL,1,1,NULL,NULL),(80,'VENTEX d.o.o.','Dražice 123, Rijeka',45.34988830,14.37305480,'','','',1,1,NULL,NULL),(81,'EKONOMSKI FAKULTET RIJEKA','Ul. Ivana Filipovića 4, Rijeka',45.33164930,14.43480340,'','','',1,1,NULL,NULL),(82,'LUKA RIJEKA d.d.','Riva 1, Rijeka',45.32712280,14.43727310,'','','',1,1,NULL,NULL),(83,'PALAČA MOISE CRES','Zagrad 6, 51557 Cres',44.95964100,14.40994060,'','','',1,1,NULL,NULL),(84,'KOSTRENSKIH BORACA 1','Kostrenskih boraca 1, Kostrena',45.30977360,14.48871100,'','','',1,1,NULL,NULL),(85,'KOSTRENSKIH BORACA 1A','Boraca 1, 52212, Fažana, Croatia',44.92641990,13.80415280,NULL,NULL,NULL,1,1,NULL,NULL),(86,'VBZ Knjižara','Korzo 32, 51000, Rijeka, Croatia',45.32760360,14.44035810,NULL,NULL,NULL,1,1,NULL,NULL),(87,'Žrtava Fašizma 9/h UMAG','Ul. Žrtava fašizma 9h, 52470, Umag, Croatia',45.42779760,13.52730330,NULL,NULL,NULL,1,1,NULL,NULL),(88,'RUPA HIGIS','90, 51211, Rupa, Croatia',45.47866960,14.28587350,NULL,NULL,NULL,1,1,NULL,NULL),(89,'HOLCIM KOROMAČNO','7, 52220, Koromačno, Croatia',44.96836340,14.12206270,'','','',1,1,NULL,NULL);
/*!40000 ALTER TABLE `locations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text,
  `link` varchar(255) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,6,'work_order','Dodijeljen radni nalog','Novi radni nalog #2 je dodijeljen.','/dashboard/work-order-detail.html?id=2',0,'2026-02-16 00:16:10'),(2,6,'work_order','Dodijeljen radni nalog','Novi radni nalog #3 je dodijeljen.','/dashboard/work-order-detail.html?id=3',0,'2026-02-16 00:17:02'),(3,6,'work_order','Dodijeljen radni nalog','Novi radni nalog #4 je dodijeljen.','/dashboard/work-order-detail.html?id=4',0,'2026-02-16 00:34:01'),(4,1,'work_order','Dodijeljen radni nalog','Novi radni nalog #5 je dodijeljen.','/dashboard/work-order-detail.html?id=5',0,'2026-02-16 00:58:32'),(5,6,'work_order','Dodijeljen radni nalog','Novi radni nalog #5 je dodijeljen.','/dashboard/work-order-detail.html?id=5',0,'2026-02-16 00:58:32'),(6,1,'intervention','Nova intervencija','Dodana je nova intervencija za lokaciju N. KATUNARA 4.','/dashboard/interventions.html',0,'2026-02-18 22:27:53'),(7,1,'intervention','Nova intervencija','Dodana je nova intervencija za lokaciju N. KATUNARA 4.','/dashboard/interventions.html',1,'2026-02-19 14:57:39');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_password_resets_token` (`token`),
  KEY `idx_password_resets_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_activity`
--

DROP TABLE IF EXISTS `project_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_activity` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `company_id` int NOT NULL,
  `user_id` int NOT NULL,
  `type` varchar(50) NOT NULL,
  `meta` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_activity_project_id` (`project_id`),
  KEY `idx_project_activity_company_id` (`company_id`),
  KEY `fk_project_activity_user` (`user_id`),
  CONSTRAINT `fk_project_activity_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_project_activity_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_activity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=121 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_activity`
--

LOCK TABLES `project_activity` WRITE;
/*!40000 ALTER TABLE `project_activity` DISABLE KEYS */;
INSERT INTO `project_activity` VALUES (1,4,1,1,'edited',NULL,'2026-02-16 20:26:02'),(2,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": true}','2026-02-16 20:26:24'),(3,4,1,1,'task_toggled','{\"task_id\": 5, \"is_completed\": true}','2026-02-16 20:26:25'),(4,4,1,1,'status_changed','{\"to\": \"completed\", \"from\": \"open\"}','2026-02-16 20:26:25'),(5,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": false}','2026-02-16 20:32:10'),(6,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": true}','2026-02-16 20:32:11'),(7,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": false}','2026-02-16 20:32:12'),(8,4,1,1,'task_toggled','{\"task_id\": 5, \"is_completed\": false}','2026-02-16 20:32:12'),(9,4,1,1,'task_toggled','{\"task_id\": 5, \"is_completed\": true}','2026-02-16 20:32:25'),(10,5,1,1,'edited',NULL,'2026-02-16 20:33:12'),(11,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:33:18'),(12,5,1,1,'task_toggled','{\"task_id\": 7, \"is_completed\": true}','2026-02-16 20:33:19'),(13,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:33:38'),(14,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:09'),(15,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:10'),(16,5,1,1,'task_toggled','{\"task_id\": 7, \"is_completed\": false}','2026-02-16 20:35:11'),(17,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:12'),(18,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:13'),(19,5,1,1,'task_toggled','{\"task_id\": 8, \"is_completed\": true}','2026-02-16 20:35:14'),(20,5,1,1,'task_toggled','{\"task_id\": 7, \"is_completed\": true}','2026-02-16 20:35:21'),(21,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:34'),(22,5,1,1,'status_changed','{\"to\": \"completed\", \"from\": \"open\"}','2026-02-16 20:35:34'),(23,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:35'),(24,5,1,1,'task_toggled','{\"task_id\": 7, \"is_completed\": false}','2026-02-16 20:35:36'),(25,5,1,1,'task_toggled','{\"task_id\": 8, \"is_completed\": false}','2026-02-16 20:35:37'),(26,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:39'),(27,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:39'),(28,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:39'),(29,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:40'),(30,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:40'),(31,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:40'),(32,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:41'),(33,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:41'),(34,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:45'),(35,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:45'),(36,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:35:45'),(37,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:35:46'),(38,4,1,1,'task_toggled','{\"task_id\": 5, \"is_completed\": false}','2026-02-16 20:35:52'),(39,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": true}','2026-02-16 20:35:53'),(40,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": false}','2026-02-16 20:37:32'),(41,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": true}','2026-02-16 20:37:33'),(42,4,1,1,'task_toggled','{\"task_id\": 5, \"is_completed\": true}','2026-02-16 20:37:33'),(43,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:37:40'),(44,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:37:40'),(45,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:37:41'),(46,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:37:41'),(47,5,1,1,'task_toggled','{\"task_id\": 7, \"is_completed\": true}','2026-02-16 20:37:42'),(48,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": true}','2026-02-16 20:37:56'),(49,5,1,1,'task_toggled','{\"task_id\": 6, \"is_completed\": false}','2026-02-16 20:37:56'),(50,5,1,1,'task_toggled','{\"task_id\": 7, \"is_completed\": false}','2026-02-16 20:37:57'),(51,5,1,1,'task_toggled','{\"task_id\": 7, \"is_completed\": true}','2026-02-16 20:37:57'),(52,5,1,1,'task_toggled','{\"task_id\": 8, \"is_completed\": true}','2026-02-16 20:37:58'),(53,5,1,1,'task_toggled','{\"task_id\": 8, \"is_completed\": false}','2026-02-16 20:37:58'),(54,5,1,1,'task_toggled','{\"task_id\": 8, \"is_completed\": true}','2026-02-16 20:37:59'),(55,5,1,1,'task_toggled','{\"task_id\": 8, \"is_completed\": false}','2026-02-16 20:37:59'),(56,6,1,1,'edited',NULL,'2026-02-16 20:38:18'),(57,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": true}','2026-02-16 20:38:20'),(58,6,1,1,'task_toggled','{\"task_id\": 10, \"is_completed\": true}','2026-02-16 20:38:21'),(59,6,1,1,'status_changed','{\"to\": \"completed\", \"from\": \"open\"}','2026-02-16 20:38:21'),(60,6,1,1,'task_toggled','{\"task_id\": 10, \"is_completed\": false}','2026-02-16 20:38:22'),(61,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": false}','2026-02-16 20:38:42'),(62,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": true}','2026-02-16 20:41:05'),(63,6,1,1,'task_toggled','{\"task_id\": 10, \"is_completed\": true}','2026-02-16 20:41:06'),(64,6,1,1,'task_toggled','{\"task_id\": 10, \"is_completed\": false}','2026-02-16 20:41:07'),(65,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": false}','2026-02-16 20:41:07'),(66,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": true}','2026-02-16 20:41:09'),(67,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": false}','2026-02-16 20:41:10'),(68,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": true}','2026-02-16 20:41:23'),(69,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": false}','2026-02-16 20:41:24'),(70,6,1,1,'task_toggled','{\"task_id\": 9, \"is_completed\": true}','2026-02-16 21:30:33'),(71,6,1,1,'task_toggled','{\"task_id\": 10, \"is_completed\": true}','2026-02-16 21:31:16'),(72,6,1,1,'task_toggled','{\"task_id\": 10, \"is_completed\": false}','2026-02-16 21:31:17'),(73,6,1,1,'edited',NULL,'2026-02-16 21:34:04'),(74,6,1,1,'edited',NULL,'2026-02-16 21:34:41'),(75,6,1,1,'edited',NULL,'2026-02-16 21:34:53'),(76,5,1,1,'edited',NULL,'2026-02-16 21:35:15'),(77,5,1,1,'edited',NULL,'2026-02-16 21:35:23'),(78,5,1,1,'edited',NULL,'2026-02-16 21:35:34'),(79,6,1,1,'edited',NULL,'2026-02-16 21:37:22'),(80,6,1,1,'edited',NULL,'2026-02-16 21:45:22'),(81,7,1,1,'edited',NULL,'2026-02-16 21:45:58'),(82,7,1,1,'edited',NULL,'2026-02-16 21:48:56'),(83,7,1,1,'edited',NULL,'2026-02-16 21:49:22'),(84,7,1,1,'edited',NULL,'2026-02-16 21:52:23'),(85,7,1,1,'edited',NULL,'2026-02-16 21:52:58'),(86,7,1,1,'edited',NULL,'2026-02-16 21:55:20'),(87,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": false}','2026-02-16 22:01:15'),(88,4,1,1,'task_toggled','{\"task_id\": 4, \"is_completed\": true}','2026-02-16 22:01:15'),(89,7,1,1,'edited',NULL,'2026-02-16 22:01:29'),(90,7,1,1,'edited',NULL,'2026-02-16 22:05:32'),(91,8,1,1,'edited',NULL,'2026-02-16 22:05:52'),(92,9,1,1,'edited',NULL,'2026-02-16 22:21:53'),(93,9,1,1,'edited',NULL,'2026-02-16 22:26:05'),(94,10,1,1,'edited',NULL,'2026-02-16 22:29:33'),(95,11,1,1,'edited',NULL,'2026-02-16 22:36:37'),(96,11,1,1,'task_toggled','{\"task_id\": 11, \"is_completed\": true}','2026-02-16 22:39:12'),(97,11,1,1,'status_changed','{\"to\": \"completed\", \"from\": \"open\"}','2026-02-16 22:39:12'),(98,11,1,1,'task_toggled','{\"task_id\": 11, \"is_completed\": false}','2026-02-16 22:39:13'),(99,11,1,1,'task_toggled','{\"task_id\": 11, \"is_completed\": true}','2026-02-16 22:39:35'),(100,11,1,1,'task_toggled','{\"task_id\": 12, \"is_completed\": true}','2026-02-16 23:57:20'),(101,11,1,1,'task_toggled','{\"task_id\": 12, \"is_completed\": false}','2026-02-16 23:57:21'),(102,11,1,1,'task_toggled','{\"task_id\": 12, \"is_completed\": true}','2026-02-17 00:21:16'),(103,11,1,1,'task_toggled','{\"task_id\": 12, \"is_completed\": false}','2026-02-17 00:21:17'),(104,11,1,1,'task_toggled','{\"task_id\": 13, \"is_completed\": true}','2026-02-17 00:21:18'),(105,11,1,1,'task_toggled','{\"task_id\": 13, \"is_completed\": false}','2026-02-17 00:21:19'),(106,11,1,1,'task_toggled','{\"task_id\": 14, \"is_completed\": true}','2026-02-17 00:21:26'),(107,11,1,1,'task_toggled','{\"task_id\": 14, \"is_completed\": false}','2026-02-17 00:21:26'),(108,11,1,1,'task_commented','{\"task_id\": \"11\", \"comment_id\": 2}','2026-02-17 00:29:15'),(109,11,1,1,'task_commented','{\"task_id\": \"13\", \"comment_id\": 3}','2026-02-17 00:29:28'),(110,11,1,1,'task_commented','{\"task_id\": \"12\", \"comment_id\": 4}','2026-02-17 00:30:24'),(111,11,1,1,'task_commented','{\"task_id\": \"13\", \"comment_id\": 5}','2026-02-17 00:33:31'),(112,11,1,1,'task_commented','{\"task_id\": \"14\", \"comment_id\": 6}','2026-02-17 00:35:59'),(113,11,1,1,'task_toggled','{\"task_id\": 14, \"is_completed\": true}','2026-02-17 00:36:03'),(114,11,1,1,'task_toggled','{\"task_id\": 14, \"is_completed\": false}','2026-02-17 00:36:04'),(115,11,1,1,'task_toggled','{\"task_id\": 14, \"is_completed\": true}','2026-02-17 00:36:04'),(116,11,1,1,'task_commented','{\"task_id\": \"15\", \"comment_id\": 7}','2026-02-17 00:36:25'),(117,11,1,1,'task_toggled','{\"task_id\": 15, \"is_completed\": true}','2026-02-17 00:37:01'),(118,11,1,1,'task_toggled','{\"task_id\": 15, \"is_completed\": false}','2026-02-17 00:37:02'),(119,11,1,1,'task_toggled','{\"task_id\": 12, \"is_completed\": true}','2026-02-17 01:13:19'),(120,11,1,1,'task_toggled','{\"task_id\": 12, \"is_completed\": false}','2026-02-17 01:13:20');
/*!40000 ALTER TABLE `project_activity` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_attachments`
--

DROP TABLE IF EXISTS `project_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `company_id` int NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_by` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_attachments_project_id` (`project_id`),
  KEY `idx_project_attachments_company_id` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_attachments`
--

LOCK TABLES `project_attachments` WRITE;
/*!40000 ALTER TABLE `project_attachments` DISABLE KEYS */;
/*!40000 ALTER TABLE `project_attachments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_sections`
--

DROP TABLE IF EXISTS `project_sections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_sections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `order_index` int NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_project_sections_project_id` (`project_id`),
  CONSTRAINT `fk_project_sections_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_sections`
--

LOCK TABLES `project_sections` WRITE;
/*!40000 ALTER TABLE `project_sections` DISABLE KEYS */;
INSERT INTO `project_sections` VALUES (1,1,'Pripremni radovi',0,0),(2,2,'sgsdfgsd',0,0),(3,2,'aaaa',0,0),(4,4,'gadgaga',0,1),(5,5,'priprema',0,1),(6,5,'izvedba',0,2),(7,6,'rtrt',0,1),(8,11,'Nova sekcija',0,1),(9,11,'Nova sekcija',0,2),(10,11,'Nova sekcija',0,3);
/*!40000 ALTER TABLE `project_sections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_task_comments`
--

DROP TABLE IF EXISTS `project_task_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_task_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `comment` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_project_task_comments_task_id` (`task_id`),
  KEY `fk_project_task_comments_user` (`user_id`),
  CONSTRAINT `fk_project_task_comments_task` FOREIGN KEY (`task_id`) REFERENCES `project_tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_task_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_task_comments`
--

LOCK TABLES `project_task_comments` WRITE;
/*!40000 ALTER TABLE `project_task_comments` DISABLE KEYS */;
INSERT INTO `project_task_comments` VALUES (1,1,1,'yybb','2026-02-11 19:28:10',1),(2,11,1,'l','2026-02-16 23:29:15',1),(3,13,1,'kokokokoko','2026-02-16 23:29:28',1),(4,12,1,'hhhhh','2026-02-16 23:30:24',1),(5,13,1,'gugu','2026-02-16 23:33:31',1),(6,14,1,'lolo','2026-02-16 23:35:59',1),(7,15,1,'loloooooo','2026-02-16 23:36:25',1);
/*!40000 ALTER TABLE `project_task_comments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_task_users`
--

DROP TABLE IF EXISTS `project_task_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_task_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_project_task_user` (`task_id`,`user_id`),
  KEY `idx_project_task_id` (`task_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_project_task_users_task` FOREIGN KEY (`task_id`) REFERENCES `project_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_task_users_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_task_users`
--

LOCK TABLES `project_task_users` WRITE;
/*!40000 ALTER TABLE `project_task_users` DISABLE KEYS */;
INSERT INTO `project_task_users` VALUES (1,1,6,'2026-02-11 19:20:45'),(2,3,6,'2026-02-11 19:21:25'),(5,11,6,'2026-02-16 23:08:49'),(6,12,3,'2026-02-16 23:08:56'),(24,15,6,'2026-02-16 23:37:12'),(25,15,3,'2026-02-16 23:37:12');
/*!40000 ALTER TABLE `project_task_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_tasks`
--

DROP TABLE IF EXISTS `project_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_section_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `assigned_user_id` int DEFAULT NULL,
  `is_completed` tinyint(1) NOT NULL DEFAULT '0',
  `completed_at` timestamp NULL DEFAULT NULL,
  `order_index` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_project_tasks_section_id` (`project_section_id`),
  KEY `fk_project_tasks_assigned_user` (`assigned_user_id`),
  CONSTRAINT `fk_project_tasks_assigned_user` FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_project_tasks_section` FOREIGN KEY (`project_section_id`) REFERENCES `project_sections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_tasks`
--

LOCK TABLES `project_tasks` WRITE;
/*!40000 ALTER TABLE `project_tasks` DISABLE KEYS */;
INSERT INTO `project_tasks` VALUES (1,2,'gGG','GG',NULL,1,'2026-02-11 19:24:06',0,'2026-02-11 19:20:45',0),(2,2,'BbBb','ffsGsgadgad',NULL,1,'2026-02-11 21:11:37',0,'2026-02-11 19:21:01',0),(3,3,'Isprazni oknp','ispraziniti sve !',NULL,1,'2026-02-11 21:11:42',0,'2026-02-11 19:21:25',0),(4,4,'agadg',NULL,NULL,1,NULL,0,'2026-02-16 19:26:02',1),(5,4,'adgadga',NULL,NULL,1,NULL,0,'2026-02-16 19:26:02',2),(11,8,'Novi zadatak','Novi zadatak',NULL,1,NULL,0,'2026-02-16 21:39:10',1),(12,8,'Novi zadatak','Novi zadatak',NULL,0,NULL,0,'2026-02-16 21:39:19',2),(13,8,'jblj','jblj',NULL,0,NULL,0,'2026-02-16 22:57:57',3),(14,8,'hjln','hjln',NULL,1,NULL,0,'2026-02-16 23:08:40',4),(15,8,'jjjj','jjjj',NULL,0,NULL,0,'2026-02-16 23:21:32',5);
/*!40000 ALTER TABLE `project_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `project_users`
--

DROP TABLE IF EXISTS `project_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project_users` (
  `project_id` int NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`project_id`,`user_id`),
  KEY `fk_project_users_user` (`user_id`),
  CONSTRAINT `fk_project_users_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_users_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_users`
--

LOCK TABLES `project_users` WRITE;
/*!40000 ALTER TABLE `project_users` DISABLE KEYS */;
INSERT INTO `project_users` VALUES (6,3),(7,3),(4,6),(5,6),(6,6),(7,6);
/*!40000 ALTER TABLE `project_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `projects`
--

DROP TABLE IF EXISTS `projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `location_id` int DEFAULT NULL,
  `status` enum('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  `start_date` date DEFAULT NULL,
  `expected_end_date` date DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `due_date` date DEFAULT NULL,
  `owner_user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_projects_company_id` (`company_id`),
  KEY `fk_projects_location` (`location_id`),
  KEY `fk_projects_created_by` (`created_by`),
  CONSTRAINT `fk_projects_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_projects_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_projects_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` VALUES (1,1,'Njivice Alfred - struja','Izvodenje elektroinstalacija u kuci sa 2 stana na 2 kata + podrum',NULL,'open','2026-02-11','2026-03-27',1,'2026-02-11 18:32:04',NULL,NULL),(2,1,'sdgsg','sgsdgsgs',NULL,'open',NULL,NULL,1,'2026-02-11 18:56:47',NULL,NULL),(3,1,'dsvafaf','asfasf',10,'open',NULL,NULL,1,'2026-02-11 21:12:00',NULL,NULL),(4,1,'Testni projekt','Ovo je neki opis',NULL,'completed',NULL,NULL,1,'2026-02-16 18:41:27',NULL,NULL),(5,1,'lolo','lolo',NULL,'completed',NULL,NULL,1,'2026-02-16 19:32:38','2026-02-14',NULL),(6,1,'trtrtrt','rtrtrt',NULL,'completed',NULL,NULL,1,'2026-02-16 19:38:07',NULL,3),(7,1,'45','45555',NULL,'open',NULL,NULL,1,'2026-02-16 20:45:37',NULL,6),(8,1,'faffffff','fff',NULL,'open',NULL,NULL,1,'2026-02-16 21:05:39',NULL,NULL),(9,1,'111','1111',NULL,'open',NULL,NULL,1,'2026-02-16 21:21:43',NULL,6),(10,1,'haha','ahaha',NULL,'open',NULL,NULL,1,'2026-02-16 21:29:24',NULL,NULL),(11,1,'afafafaf','afaf',NULL,'completed',NULL,NULL,1,'2026-02-16 21:36:26',NULL,NULL);
/*!40000 ALTER TABLE `projects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rms_images`
--

DROP TABLE IF EXISTS `rms_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rms_images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rms_id` int NOT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `rms_id` (`rms_id`),
  CONSTRAINT `rms_images_ibfk_1` FOREIGN KEY (`rms_id`) REFERENCES `rms_records` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rms_images`
--

LOCK TABLES `rms_images` WRITE;
/*!40000 ALTER TABLE `rms_images` DISABLE KEYS */;
/*!40000 ALTER TABLE `rms_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rms_records`
--

DROP TABLE IF EXISTS `rms_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rms_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `elevator_id` int DEFAULT NULL,
  `date` date NOT NULL,
  `rms_period` varchar(10) DEFAULT NULL,
  `document_name` varchar(255) DEFAULT NULL,
  `technician` varchar(100) DEFAULT NULL,
  `second_technician` varchar(100) DEFAULT NULL,
  `notes` text,
  `status` varchar(50) DEFAULT 'O.K.',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `location_id` int DEFAULT NULL,
  `uploaded_files` text,
  PRIMARY KEY (`id`),
  KEY `elevator_id` (`elevator_id`),
  KEY `fk_location` (`location_id`),
  CONSTRAINT `fk_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rms_records_ibfk_1` FOREIGN KEY (`elevator_id`) REFERENCES `elevators` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rms_records`
--

LOCK TABLES `rms_records` WRITE;
/*!40000 ALTER TABLE `rms_records` DISABLE KEYS */;
INSERT INTO `rms_records` VALUES (8,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','dasfaf','affa','2026-01-25 23:59:02',NULL,NULL),(9,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','dasfaf','affa','2026-01-25 23:59:04',NULL,NULL),(10,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','dasfaf','affa','2026-01-25 23:59:07',NULL,NULL),(11,NULL,'2026-01-26',NULL,NULL,'Administrator',NULL,'','SVE U REDU','2026-01-26 00:03:54',NULL,NULL),(12,NULL,'2026-01-26',NULL,NULL,'Administrator',NULL,'','agaga','2026-01-26 00:03:57',NULL,NULL),(13,NULL,'2026-01-26',NULL,NULL,'Administrator',NULL,'adga','agaga','2026-01-26 00:04:10',NULL,NULL),(14,NULL,'2026-01-26',NULL,NULL,'Administrator',NULL,'adga','agaga','2026-01-26 00:04:16',NULL,NULL),(15,NULL,'2026-01-26',NULL,NULL,'Administrator','Administrator','adga','agaga','2026-01-26 00:04:20',NULL,NULL),(16,NULL,'2026-01-26',NULL,NULL,'Administrator','Administrator','adga','agaga','2026-01-26 00:04:21',NULL,NULL),(17,NULL,'2026-01-26',NULL,NULL,'Administrator','Administrator','adga','agaga','2026-01-26 00:04:24',NULL,NULL),(18,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','afag','agag','2026-01-26 07:48:33',NULL,NULL),(19,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','agga','SVE U REDU','2026-01-26 07:52:58',NULL,NULL),(20,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','Ovo je test','Ovo je test','2026-01-26 07:53:49',NULL,NULL),(21,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','nema komentara','sve ok','2026-01-26 08:39:27',NULL,NULL),(22,NULL,'2026-01-26',NULL,NULL,'Administrator','Rezervni Admin','tata mama kcer','tata mama kcer','2026-01-26 08:46:19',NULL,NULL),(23,NULL,'2026-01-26','02/26',NULL,'Administrator','Rezervni Admin','had disk','hard disk','2026-01-26 08:53:55',NULL,NULL),(24,NULL,'2026-01-26','01/26',NULL,'Administrator','Rezervni Admin','ča si rekal','ča si rekal','2026-01-26 08:57:24',NULL,NULL),(25,NULL,'2026-01-26','01/26','RKR-RMS-01/26-26.01.2026-10000','Administrator','Administrator','rrrrrr','rrrrrr','2026-01-26 09:16:21',NULL,NULL),(26,NULL,'2026-01-26','05/26','NK4-RMS-05/26-26.01.2026-10000','Administrator','Administrator','šđž','šđž','2026-01-26 09:16:59',NULL,NULL),(27,NULL,'2026-01-26',NULL,'RKR-RMS-XX/XX-26.01.2026-10000','Administrator','Rezervni Admin','šđž','šđž','2026-01-26 09:42:16',NULL,NULL),(28,NULL,'2026-01-26','01/26','JPK3-RMS-01/26-26.01.2026-10000','Administrator','Rezervni Admin','ŠĐĆ','ŠĐĆ','2026-01-26 10:56:37',20,NULL),(29,NULL,'2026-01-28',NULL,'DG12-RMS-XX/XX-28.01.2026-10000','Administrator',NULL,'agag','agagaga','2026-01-28 10:05:44',9,'/uploads/rms/1769594744577-842297409.png'),(30,NULL,'2026-01-29',NULL,'DŠ24-RMS-XX/XX-29.01.2026-10000','Administrator','Testni lik','sggsg','sgsgsg','2026-01-29 12:13:21',11,''),(31,NULL,'2026-01-29',NULL,'M29-RMS-XX/XX-29.01.2026-10000','Administrator','Testni lik','Ovo je test','Ovo je test','2026-01-29 20:15:18',15,''),(32,NULL,'2026-01-29',NULL,'Z9-RMS-XX/XX-29.01.2026-10000','Administrator',NULL,'zeze','zrze','2026-01-29 20:22:42',24,''),(33,NULL,'2026-01-30','03/26','NK13-RMS-03/26-30.01.2026-10000','admin','Ranjith','fadgaga','O.K.','2026-01-30 11:43:38',34,''),(34,NULL,'2026-01-31',NULL,'NK4-RMS-XX/XX-31.01.2026-10000','admin','Administrator','zezez','Potreban popravak - Dizalo nije u funkciji','2026-01-31 22:39:28',30,''),(35,NULL,'2026-01-31',NULL,'NK4-RMS-XX/XX-31.01.2026-10000','admin','Administrator','','O.K.','2026-01-31 22:46:34',30,''),(36,NULL,'2026-02-04','09/29','NK4-RMS-09/29-04.02.2026-10000','admin','Rezervni Admin','','O.K.','2026-02-04 18:38:35',30,''),(37,NULL,'2026-02-04',NULL,'NK4-RMS-XX/XX-04.02.2026-10000','admin','Administrator','','O.K.','2026-02-04 18:44:52',30,''),(38,NULL,'2026-02-04',NULL,'NK4-RMS-XX/XX-04.02.2026-10000','admin',NULL,'','O.K.','2026-02-04 19:10:57',30,''),(39,NULL,'2026-02-04',NULL,'NK4-RMS-XX/XX-04.02.2026-10000','','Administrator','','O.K.','2026-02-04 19:19:10',30,'');
/*!40000 ALTER TABLE `rms_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rms_visit_items`
--

DROP TABLE IF EXISTS `rms_visit_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rms_visit_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `visit_id` int NOT NULL,
  `elevator_label` varchar(255) NOT NULL,
  `status` varchar(100) NOT NULL,
  `comment` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rms_visit_item` (`visit_id`,`elevator_label`),
  KEY `idx_rms_visit_items_visit` (`visit_id`),
  KEY `idx_rms_visit_items_visit_label` (`visit_id`,`elevator_label`),
  KEY `idx_rms_visit_items_company_id` (`company_id`),
  CONSTRAINT `fk_rms_visit_items_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rms_visit_items`
--

LOCK TABLES `rms_visit_items` WRITE;
/*!40000 ALTER TABLE `rms_visit_items` DISABLE KEYS */;
INSERT INTO `rms_visit_items` VALUES (1,2,'D1','O.K.','ok','2026-02-04 20:55:16',1),(2,7,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','fafasfaf','2026-02-04 21:07:29',1),(3,7,'D2 (neparni / odd)','O.K.',NULL,'2026-02-04 21:07:29',1),(4,8,'D1 (parni / even)','Potreban popravak - Dizalo nije u funkciji','ovo stvarno ne radi','2026-02-04 21:08:29',1),(5,8,'D2 (neparni / odd)','O.K.',NULL,'2026-02-04 21:08:29',1),(6,9,'D1 (parni / even)','Potreban popravak - Dizalo nije u funkciji','danasnji test','2026-02-05 15:40:35',1),(7,9,'D2 (neparni / odd)','Potreban popravak - Dizalo u funkciji',NULL,'2026-02-05 15:40:35',1),(8,10,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','opopopopopopop','2026-02-05 16:14:35',1),(9,10,'D2 (neparni / odd)','O.K.',NULL,'2026-02-05 16:14:35',1),(10,11,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','TREBA PROVJERITI !','2026-02-05 18:52:51',1),(11,11,'D2 (neparni / odd)','O.K.',NULL,'2026-02-05 18:52:51',1),(12,12,'D1 (parni / even)','O.K.','Sad je OK','2026-02-05 23:02:19',1),(13,12,'D2 (neparni / odd)','O.K.',NULL,'2026-02-05 23:02:19',1),(14,13,'D1 (parni / even)','Potreban popravak - Dizalo nije u funkciji',NULL,'2026-02-05 23:19:04',1),(15,13,'D2 (neparni / odd)','Potreban popravak - Dizalo u funkciji',NULL,'2026-02-05 23:19:04',1),(16,14,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','6th floor lock chanfge.','2026-02-10 13:10:30',1),(17,14,'D2 (neparni / odd)','O.K.',NULL,'2026-02-10 13:10:30',1),(18,16,'D1 (parni / even)','O.K.',NULL,'2026-02-17 18:27:32',1),(19,16,'D2 (neparni / odd)','O.K.',NULL,'2026-02-17 18:27:32',1),(20,18,'D1 (parni / even)','O.K.',NULL,'2026-02-17 19:25:52',1),(21,18,'D2 (neparni / odd)','O.K.',NULL,'2026-02-17 19:25:52',1),(22,20,'D1 (parni / even)','Potreban popravak - Dizalo nije u funkciji','ne valja','2026-02-17 19:42:46',1),(23,20,'D2 (neparni / odd)','O.K.',NULL,'2026-02-17 19:42:46',1),(24,21,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','sgsgsgs','2026-02-18 21:01:33',1),(25,21,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:01:33',1),(26,22,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','sgsgsgs','2026-02-18 21:02:15',1),(27,22,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:02:15',1),(28,23,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','sgsgsgs','2026-02-18 21:02:17',1),(29,23,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:02:17',1),(30,24,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','sgsgsgs','2026-02-18 21:02:22',1),(31,24,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:02:22',1),(32,25,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','sgsgsgs','2026-02-18 21:02:30',1),(33,25,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:02:30',1),(34,26,'D1 (parni / even)','O.K.',NULL,'2026-02-18 21:10:11',1),(35,26,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:10:11',1),(36,27,'D1 (parni / even)','O.K.',NULL,'2026-02-18 21:11:01',1),(37,27,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:11:01',1),(38,28,'D1 (parni / even)','O.K.',NULL,'2026-02-18 21:18:54',1),(39,28,'D2 (neparni / odd)','O.K.',NULL,'2026-02-18 21:18:54',1);
/*!40000 ALTER TABLE `rms_visit_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rms_visits`
--

DROP TABLE IF EXISTS `rms_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rms_visits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `visit_date` datetime NOT NULL,
  `rms_month` date DEFAULT NULL,
  `notes_general` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL,
  `technician_signature_path` varchar(255) DEFAULT NULL,
  `client_signature_path` varchar(255) DEFAULT NULL,
  `signed_by_user_id` int DEFAULT NULL,
  `signed_at` datetime DEFAULT NULL,
  `signature_ip` varchar(100) DEFAULT NULL,
  `status` enum('draft','signed') DEFAULT 'draft',
  `document_hash` varchar(255) DEFAULT NULL,
  `signature_status` enum('draft','signed') DEFAULT 'draft',
  PRIMARY KEY (`id`),
  KEY `idx_rms_visits_location` (`location_id`),
  KEY `idx_rms_visits_company_id` (`company_id`),
  CONSTRAINT `fk_rms_visits_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rms_visits`
--

LOCK TABLES `rms_visits` WRITE;
/*!40000 ALTER TABLE `rms_visits` DISABLE KEYS */;
INSERT INTO `rms_visits` VALUES (2,30,NULL,'2026-02-04 00:00:00',NULL,'test','2026-02-04 20:55:16',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(7,30,NULL,'2026-02-04 00:00:00',NULL,NULL,'2026-02-04 21:07:29',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(8,30,NULL,'2026-02-04 00:00:00',NULL,NULL,'2026-02-04 21:08:29',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(9,30,NULL,'2026-02-05 00:00:00',NULL,NULL,'2026-02-05 15:40:35',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(10,30,NULL,'2026-02-05 00:00:00',NULL,NULL,'2026-02-05 16:14:35',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(11,30,NULL,'2026-02-05 00:00:00',NULL,NULL,'2026-02-05 18:52:51',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(12,30,NULL,'2026-02-06 00:00:00',NULL,NULL,'2026-02-05 23:02:19',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(13,30,NULL,'2026-02-06 00:00:00',NULL,NULL,'2026-02-05 23:19:04',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(14,30,NULL,'2026-02-10 00:00:00',NULL,NULL,'2026-02-10 13:10:30',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(15,74,NULL,'2026-02-17 00:00:00',NULL,'gsgsg','2026-02-17 18:19:06',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(16,30,NULL,'2026-02-17 00:00:00',NULL,'sdvsv','2026-02-17 18:27:32',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(17,74,NULL,'2026-02-17 00:00:00',NULL,'ddd','2026-02-17 19:18:23',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(18,30,NULL,'2026-02-17 00:00:00',NULL,NULL,'2026-02-17 19:25:52',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(19,74,NULL,'2026-02-17 00:00:00',NULL,'afafa','2026-02-17 19:40:30',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(20,30,NULL,'2026-02-07 00:00:00',NULL,'generalno sve ok','2026-02-17 19:42:46',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(21,30,NULL,'2026-02-18 00:00:00',NULL,'SVe radi, sljedeci put provjeriti zabravu na 7.katu','2026-02-18 21:01:33',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(22,30,NULL,'2026-02-18 00:00:00',NULL,'SVe radi, sljedeci put provjeriti zabravu na 7.katu','2026-02-18 21:02:15',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(23,30,NULL,'2026-02-18 00:00:00',NULL,'SVe radi, sljedeci put provjeriti zabravu na 7.katu','2026-02-18 21:02:17',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(24,30,NULL,'2026-02-18 00:00:00',NULL,'SVe radi, sljedeci put provjeriti zabravu na 7.katu','2026-02-18 21:02:22',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(25,30,NULL,'2026-02-18 00:00:00',NULL,'SVe radi, sljedeci put provjeriti zabravu na 7.katu','2026-02-18 21:02:30',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(26,30,NULL,'2026-02-18 00:00:00',NULL,NULL,'2026-02-18 21:10:11',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(27,30,NULL,'2026-02-18 00:00:00',NULL,NULL,'2026-02-18 21:11:01',1,NULL,NULL,NULL,NULL,NULL,'draft',NULL,'draft'),(28,30,NULL,'2026-02-18 00:00:00',NULL,NULL,'2026-02-18 21:18:54',1,'/uploads/signatures/1-rms-28-tech-1771449534346.png','/uploads/signatures/1-rms-28-client-1771449534347.png',1,'2026-02-18 22:18:54','::1','draft','bc45af9302d2e9ed93af4524707b7944a802038c5a8be5195a05041075c1eb84','signed');
/*!40000 ALTER TABLE `rms_visits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES ('TO5IvTYH6v4KXLfxM-eS-VHWFkls9ZWJ',1773163193,'{\"cookie\":{\"originalMaxAge\":null,\"expires\":null,\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user_id\":1,\"user_email\":\"info@rijeka-dizalo.hr\",\"active_company_id\":1,\"global_role\":\"user\",\"user\":{\"id\":1,\"email\":\"info@rijeka-dizalo.hr\",\"global_role\":\"user\",\"active_company_id\":1},\"user_language\":\"hr\"}');
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_companies`
--

DROP TABLE IF EXISTS `user_companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_companies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `company_id` int NOT NULL,
  `role` enum('admin','technician','viewer') DEFAULT 'admin',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `invited_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_company` (`user_id`,`company_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_companies`
--

LOCK TABLES `user_companies` WRITE;
/*!40000 ALTER TABLE `user_companies` DISABLE KEYS */;
INSERT INTO `user_companies` VALUES (1,1,1,'admin','2026-02-19 22:19:19',NULL),(2,3,1,'admin','2026-02-19 22:19:19',NULL),(3,5,1,'technician','2026-02-19 22:19:19',NULL),(4,6,1,'technician','2026-02-19 22:19:19',NULL),(8,1,2,'admin','2026-02-19 22:19:30',NULL);
/*!40000 ALTER TABLE `user_companies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('superadmin','admin','technician') NOT NULL DEFAULT 'technician',
  `full_name` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int DEFAULT NULL,
  `disabled_at` timestamp NULL DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `is_verified` tinyint(1) DEFAULT '0',
  `global_role` enum('user','superadmin') DEFAULT 'user',
  `language` varchar(5) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `uniq_users_email` (`email`),
  KEY `idx_users_company_id` (`company_id`),
  CONSTRAINT `fk_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'info@rijeka-dizalo.hr','$2b$10$YHtT6.GfNUlTOepQoZCOaO3GBtGTL3JZTqgGvqO.yYsteSm71.PZu','admin','Administrator','2026-01-11 18:51:36',1,NULL,'info@rijeka-dizalo.hr','$2b$10$YHtT6.GfNUlTOepQoZCOaO3GBtGTL3JZTqgGvqO.yYsteSm71.PZu',1,0,'user','hr'),(3,'admin2','$2b$10$7fEoA7zvV5nW0etw97fBOe5JUk/6F2ThAi8T2bIt7uI0z0ndR5Ih2','admin','Rezervni Admin','2026-01-12 18:34:08',1,NULL,'admin2@liftelo.local','$2b$10$7fEoA7zvV5nW0etw97fBOe5JUk/6F2ThAi8T2bIt7uI0z0ndR5Ih2',1,0,'user',NULL),(5,'Testni lik','$2b$10$Lm08Y0KboOgYEpkzVKPP9u/oCMTXZZa1Vt8Qxp47ZsMCj6urAAHKK','technician','Testni lik','2026-01-25 23:25:34',1,'2026-02-06 13:56:02','Testni lik@liftelo.local','$2b$10$Lm08Y0KboOgYEpkzVKPP9u/oCMTXZZa1Vt8Qxp47ZsMCj6urAAHKK',1,0,'user',NULL),(6,'ranjith','$2b$10$6TAaSshm6PrZ4IiobgF0dulgPJr/SF8wzQbnne9P5/am9dXBWjPDO','technician','Ranjith','2026-01-26 12:56:31',1,NULL,'ranjith@liftelo.local','$2b$10$6TAaSshm6PrZ4IiobgF0dulgPJr/SF8wzQbnne9P5/am9dXBWjPDO',1,0,'user',NULL),(7,'Mario Butkovic (Platform Owner)','$2b$10$3aPvTZX0DTttu8Ug.AWIcOvNCwid7hHCGNcxeFbqAAn7vLAYsK8/G','superadmin','Mario Butkovic (Platform Owner)','2026-02-19 14:28:45',NULL,NULL,'mario.butkovic22@gmail.com','$2b$10$3aPvTZX0DTttu8Ug.AWIcOvNCwid7hHCGNcxeFbqAAn7vLAYsK8/G',1,0,'superadmin',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles`
--

DROP TABLE IF EXISTS `vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `year` int NOT NULL,
  `last_registration_date` date NOT NULL,
  `registration_expiry_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vehicles_company_id` (`company_id`),
  CONSTRAINT `fk_vehicles_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles`
--

LOCK TABLES `vehicles` WRITE;
/*!40000 ALTER TABLE `vehicles` DISABLE KEYS */;
INSERT INTO `vehicles` VALUES (1,1,'Ford Transit','/uploads/vehicle-images/1-1.jpg',2020,'2026-01-31','2027-01-31','2026-02-11 17:58:05');
/*!40000 ALTER TABLE `vehicles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_order_activity`
--

DROP TABLE IF EXISTS `work_order_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_order_activity` (
  `id` int NOT NULL AUTO_INCREMENT,
  `work_order_id` int NOT NULL,
  `company_id` int NOT NULL,
  `user_id` int NOT NULL,
  `type` varchar(50) NOT NULL,
  `meta` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `work_order_id` (`work_order_id`),
  KEY `company_id` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_activity`
--

LOCK TABLES `work_order_activity` WRITE;
/*!40000 ALTER TABLE `work_order_activity` DISABLE KEYS */;
/*!40000 ALTER TABLE `work_order_activity` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_order_attachments`
--

DROP TABLE IF EXISTS `work_order_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_order_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `work_order_id` int NOT NULL,
  `company_id` int NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `uploaded_by` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `work_order_id` (`work_order_id`),
  KEY `company_id` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_attachments`
--

LOCK TABLES `work_order_attachments` WRITE;
/*!40000 ALTER TABLE `work_order_attachments` DISABLE KEYS */;
/*!40000 ALTER TABLE `work_order_attachments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_order_elevators`
--

DROP TABLE IF EXISTS `work_order_elevators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_order_elevators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `work_order_id` int NOT NULL,
  `company_id` int NOT NULL,
  `elevator_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_elevators_company` (`company_id`),
  KEY `idx_work_order_elevators_order` (`work_order_id`),
  KEY `idx_work_order_elevators_elevator` (`elevator_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_elevators`
--

LOCK TABLES `work_order_elevators` WRITE;
/*!40000 ALTER TABLE `work_order_elevators` DISABLE KEYS */;
INSERT INTO `work_order_elevators` VALUES (1,1,1,6,'2026-02-08 17:25:49'),(2,2,1,6,'2026-02-15 23:16:10'),(3,4,1,5,'2026-02-15 23:34:01'),(4,4,1,6,'2026-02-15 23:34:01'),(7,5,1,5,'2026-02-16 00:21:30'),(8,5,1,6,'2026-02-16 00:21:30');
/*!40000 ALTER TABLE `work_order_elevators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_order_items`
--

DROP TABLE IF EXISTS `work_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `work_order_id` int NOT NULL,
  `company_id` int NOT NULL,
  `description` text NOT NULL,
  `sort_order` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_completed` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_work_order_items_company` (`company_id`),
  KEY `idx_work_order_items_order` (`work_order_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_items`
--

LOCK TABLES `work_order_items` WRITE;
/*!40000 ALTER TABLE `work_order_items` DISABLE KEYS */;
INSERT INTO `work_order_items` VALUES (1,1,1,'Zamjena uznice',1,'2026-02-08 17:25:49',0),(2,2,1,'oooo',1,'2026-02-15 23:16:10',0),(3,2,1,'iiii',2,'2026-02-15 23:16:10',0),(4,3,1,'huhuh',1,'2026-02-15 23:17:02',0),(5,3,1,'hihihihi',2,'2026-02-15 23:17:02',0),(6,4,1,'Skini',1,'2026-02-15 23:34:01',0),(7,4,1,'Stavi',2,'2026-02-15 23:34:01',0),(8,5,1,'nn',1,'2026-02-15 23:58:32',1),(9,5,1,'nn',2,'2026-02-15 23:58:32',0),(10,5,1,'nn',3,'2026-02-15 23:58:32',0);
/*!40000 ALTER TABLE `work_order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_order_users`
--

DROP TABLE IF EXISTS `work_order_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_order_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `work_order_id` int NOT NULL,
  `company_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_users_company` (`company_id`),
  KEY `idx_work_order_users_order` (`work_order_id`),
  KEY `idx_work_order_users_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_users`
--

LOCK TABLES `work_order_users` WRITE;
/*!40000 ALTER TABLE `work_order_users` DISABLE KEYS */;
INSERT INTO `work_order_users` VALUES (1,1,1,6,'2026-02-08 17:25:49'),(2,2,1,6,'2026-02-15 23:16:10'),(3,3,1,6,'2026-02-15 23:17:02'),(4,4,1,6,'2026-02-15 23:34:01'),(7,5,1,1,'2026-02-16 00:21:30'),(8,5,1,6,'2026-02-16 00:21:30');
/*!40000 ALTER TABLE `work_order_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_orders`
--

DROP TABLE IF EXISTS `work_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `location_id` int NOT NULL,
  `created_by_user_id` int DEFAULT NULL,
  `status` enum('open','completed','cancelled') NOT NULL DEFAULT 'open',
  `due_date` date DEFAULT NULL,
  `general_comment` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` timestamp NULL DEFAULT NULL,
  `closed_by_user_id` int DEFAULT NULL,
  `issued_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_work_orders_company` (`company_id`),
  KEY `idx_work_orders_location` (`location_id`),
  KEY `idx_work_orders_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_orders`
--

LOCK TABLES `work_orders` WRITE;
/*!40000 ALTER TABLE `work_orders` DISABLE KEYS */;
INSERT INTO `work_orders` VALUES (1,1,30,1,'open','2026-02-20','Uznica je u radioni','2026-02-08 17:25:49',NULL,NULL,NULL),(2,1,30,1,'open',NULL,'kkkk','2026-02-15 23:16:10',NULL,NULL,'2026-02-15'),(3,1,34,1,'open',NULL,'huhuhuhuhu','2026-02-15 23:17:02',NULL,NULL,'2026-02-15'),(4,1,30,1,'completed','2026-02-18','Ovo treba napraviti','2026-02-15 23:34:01','2026-02-15 23:57:58',1,'2026-02-15'),(5,1,30,1,'completed','2026-02-17','nnnn','2026-02-15 23:58:32','2026-02-15 23:59:01',1,'2026-02-14');
/*!40000 ALTER TABLE `work_orders` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-09 19:36:59
