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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `companies`
--

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
INSERT INTO `companies` VALUES (1,'Rijeka Dizalo','2026-02-06 11:27:38',NULL);
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `elevators`
--

LOCK TABLES `elevators` WRITE;
/*!40000 ALTER TABLE `elevators` DISABLE KEYS */;
INSERT INTO `elevators` VALUES (2,76,'D1',NULL,NULL,NULL,NULL,NULL,NULL,'SVE RADI',1),(5,30,'D1 (parni / even)','X562388','BMC3000','Automatska','ELBAK','Master key','Kljuc je na kanalici','SVE RADI',1),(6,30,'D2 (neparni / odd)',NULL,NULL,NULL,NULL,NULL,NULL,'SVE RADI',1);
/*!40000 ALTER TABLE `elevators` ENABLE KEYS */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `intervention_items`
--

LOCK TABLES `intervention_items` WRITE;
/*!40000 ALTER TABLE `intervention_items` DISABLE KEYS */;
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
  PRIMARY KEY (`id`),
  KEY `idx_interventions_company_id` (`company_id`),
  CONSTRAINT `fk_interventions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interventions`
--

LOCK TABLES `interventions` WRITE;
/*!40000 ALTER TABLE `interventions` DISABLE KEYS */;
INSERT INTO `interventions` VALUES (3,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:41:51','NIJE RIJEŠENO','/uploads/interventions/Fc2-INTERVENCIJA-26.01.2026-6455.pdf','FČ2-INTERVENCIJA-26.01.2026-6455',13,'null','',1),(4,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:42:07','NIJE RIJEŠENO','/uploads/interventions/DG12-INTERVENCIJA-26.01.2026-6148.pdf','DG12-INTERVENCIJA-26.01.2026-6148',9,'null','',1),(5,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:47:32','NIJE RIJEŠENO','/uploads/interventions/M9-INTERVENCIJA-26.01.2026-1771.pdf','M9-INTERVENCIJA-26.01.2026-1771',14,'null','',1),(6,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 11:49:17','NIJE RIJEŠENO','/uploads/interventions/sXD15-INTERVENCIJA-26.01.2026-6939.pdf','ŠXD15-INTERVENCIJA-26.01.2026-6939',33,'null','',1),(7,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 13:58:07','NIJE RIJEŠENO','/uploads/interventions/DG12-INTERVENCIJA-26.01.2026-1743.pdf','DG12-INTERVENCIJA-26.01.2026-1743',9,'Rezervni Admin','',1),(8,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 14:04:57','NIJE RIJEŠENO','/pdfs/SK6-INTERVENCIJA-26.01.2026-5239.pdf','SK6-INTERVENCIJA-26.01.2026-5239',36,'null','',1),(9,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 14:08:04','NIJE RIJEŠENO','/pdfs/Ds24-INTERVENCIJA-26.01.2026-7774.pdf','DŠ24-INTERVENCIJA-26.01.2026-7774',11,'null','',1),(10,'2026-01-26 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-26 14:15:49','NIJE RIJEŠENO','/pdfs/F2-INTERVENCIJA-26.01.2026-9156.pdf','F2-INTERVENCIJA-26.01.2026-9156',59,'null','',1),(11,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-28 09:28:56','NIJE RIJEŠENO','/pdfs/LRD-INTERVENCIJA-28.01.2026-6651.pdf','LRD-INTERVENCIJA-28.01.2026-6651',82,'null','',1),(12,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'','2026-01-28 09:37:27','NIJE RIJEŠENO','/pdfs/Z9-INTERVENCIJA-28.01.2026-8110.pdf','Z9-INTERVENCIJA-28.01.2026-8110',24,'null','',1),(13,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'gashfhasfhasfhas','2026-01-28 09:41:01','NIJE RIJEŠENO','/pdfs/Fc2-INTERVENCIJA-28.01.2026-1515.pdf','FČ2-INTERVENCIJA-28.01.2026-1515',13,'null','',1),(14,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'agshsahasfha','2026-01-28 09:45:30','NIJE RIJEŠENO','/pdfs/FK6-INTERVENCIJA-28.01.2026-4993.pdf','FK6-INTERVENCIJA-28.01.2026-4993',51,'null','',1),(15,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'aagsHGASHASH','2026-01-28 10:04:26','NIJE RIJEŠENO','/pdfs/DG12-INTERVENCIJA-28.01.2026-7720.pdf','DG12-INTERVENCIJA-28.01.2026-7720',9,'null','',1),(16,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'aag','2026-01-28 10:06:29','NIJE RIJEŠENO','/pdfs/Ds22-INTERVENCIJA-28.01.2026-6096.pdf','DŠ22-INTERVENCIJA-28.01.2026-6096',10,'null','',1),(17,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'aagagagag','2026-01-28 10:48:41','NIJE RIJEŠENO','/pdfs/FK6-INTERVENCIJA-28.01.2026-9614.pdf','FK6-INTERVENCIJA-28.01.2026-9614',51,'null','/uploads/interventions/18dc85cb38bfc7f3cb8a01ae947c92e4, /uploads/interventions/b4d4b75dbcc44a5af094829e2ddc971d',1),(18,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'agagag','2026-01-28 10:50:37','NIJE RIJEŠENO','/pdfs/DG12-INTERVENCIJA-28.01.2026-1682.pdf','DG12-INTERVENCIJA-28.01.2026-1682',9,'null','/uploads/interventions/c94f47d95697aec179491a8282635eb8, /uploads/interventions/09933c39b9df7995d5482d196a4df60f',1),(19,'2026-01-28 00:00:00','POZIV','Administrator',NULL,0,'agag','2026-01-28 10:51:32','NIJE RIJEŠENO','/pdfs/Fc2-INTERVENCIJA-28.01.2026-5945.pdf','FČ2-INTERVENCIJA-28.01.2026-5945',13,'null','/uploads/interventions/1769597491828-633204395.png, /uploads/interventions/1769597491828-668471789.png',1),(20,'2026-01-29 00:00:00','POZIV','Administrator',NULL,0,'ggggggggg','2026-01-29 12:13:00','NIJE RIJEŠENO','/pdfs/M14-INTERVENCIJA-29.01.2026-8283.pdf','M14-INTERVENCIJA-29.01.2026-8283',35,'null','',1),(21,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'','2026-01-31 22:38:44','Potreban popravak - Dizalo u funkciji','/pdfs/NK4-INTERVENCIJA-31.01.2026-9816.pdf','NK4-INTERVENCIJA-31.01.2026-9816',30,'null','',1),(22,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'tw4tw','2026-01-31 22:38:53','Potreban popravak - Dizalo u funkciji','/pdfs/NK4-INTERVENCIJA-31.01.2026-2484.pdf','NK4-INTERVENCIJA-31.01.2026-2484',30,'null','',1),(23,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'tw4tw','2026-01-31 22:39:04','Potreban popravak - Dizalo nije u funkciji','/pdfs/NK4-INTERVENCIJA-31.01.2026-1473.pdf','NK4-INTERVENCIJA-31.01.2026-1473',30,'Administrator','',1),(24,'2026-01-31 00:00:00','POZIV','undefined',NULL,0,'','2026-01-31 22:47:02','O.K.','/pdfs/NK4-INTERVENCIJA-31.01.2026-2236.pdf','NK4-INTERVENCIJA-31.01.2026-2236',30,'null','',1);
/*!40000 ALTER TABLE `interventions` ENABLE KEYS */;
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
INSERT INTO `locations` VALUES (9,'D. GODINE 12','Ul. Danijela Godine 12, 51000, Rijeka, Croatia',45.32372470,14.45977360,NULL,NULL,NULL,1,1),(10,'D. ŠČITARA 22','Drage Šćitara 22, Rijeka',45.32629210,14.46293270,'','','',1,1),(11,'D. ŠĆITARA 24','Drage Sćitara 24/d, Rijeka',45.32641250,14.46274840,'','','',1,1),(12,'D. ŠĆITARA 26','Drage Šćitara 26/d, Rijeka',45.32652830,14.46255770,'','','',1,1),(13,'F. ČANDEKA 23b','Franje Čandeka 23B, 51000, Rijeka, Croatia',45.33922420,14.41425250,NULL,NULL,NULL,1,1),(14,'MEDOVIĆEVA 9','Medovićeva ul. 9, 51000, Rijeka, Croatia',45.34424640,14.39795210,NULL,NULL,NULL,1,1),(15,'MEDOVIĆEVA 29','Medovićeva ul. 29, 51000, Rijeka, Croatia',45.34541900,14.39454540,NULL,NULL,NULL,1,1),(16,'B. KAŠIĆA 24','Bartola Kašića 24, Rijeka',45.35393890,14.36714350,'','','',1,1),(17,'KREŠIMIROVA 10','Krešimirova ul. 10, 51000, Rijeka, Croatia',45.32928690,14.43516020,NULL,NULL,NULL,1,1),(18,'N. KATUNARA 12','Katunari 12-n, 51244, Grižane-Belgrad, Croatia',45.21428210,14.69947580,NULL,NULL,NULL,1,1),(19,'J. P. KAMOVA 17','Ul. Janka Polića Kamova 17, 51000, Rijeka, Croatia',45.32114640,14.46239900,NULL,NULL,NULL,1,1),(20,'J. P. KAMOVA 37a','Ul. Janka Polića Kamova 37a, 51000, Rijeka, Croatia',45.32028430,14.46411000,NULL,NULL,NULL,1,1),(21,'A. KOVAČIĆA 17','Ul. Ante Kovačića 17, Rijeka',45.33152290,14.44756450,'','','',1,1),(22,'A. BENUSSI 8','A. BENUSSI 8, Rijeka',45.32706310,14.44217600,'','','',1,1),(23,'I. ČIKOVIĆA BELOG 8a','I.Ćikovića Belog, 51000, Rijeka, Croatia',45.34578200,14.38441200,NULL,NULL,NULL,1,1),(24,'ZAGREBAČKA 9','Zagrebačka 9, Rijeka',45.32706310,14.44217600,'','','',1,1),(25,'J. P. KAMOVA 44/a','Ul. Janka Polića Kamova 44A, 51000, Rijeka, Croatia',45.32018970,14.46360730,NULL,NULL,NULL,1,1),(26,'S. KRAUTZEKA 92a','Slavka Krautzeka 92 A, 51000, Rijeka, Croatia',45.32459050,14.46721070,NULL,NULL,NULL,1,1),(27,'S. KRAUTZEKA 92b','Slavka Krautzeka 92B, 51000, Rijeka, Croatia',45.32446330,14.46739390,NULL,NULL,NULL,1,1),(28,'S. KRAUTZEKA 92c','Slavka Krautzeka 92C, 51000, Rijeka, Croatia',45.32434490,14.46757350,NULL,NULL,NULL,1,1),(29,'SIMONETTIEVA 5','Simonettieva ul. 5, 51000, Rijeka, Croatia',45.34151330,14.40239200,NULL,NULL,NULL,1,1),(30,'N. KATUNARA 4','Nike Katunara 4, Rijeka',45.32510670,14.46331710,'Ivan Ivić','099 123 4566','Čuvati se galebova',1,1),(31,'STROSSMAYEROVA 15','Strossmayerova 15, Rijeka',45.32491580,14.45297730,'','','',1,1),(32,'STROSSMAYEROVA 13','Strossmayerova 13, Rijeka',45.32497520,14.45271240,'','','',1,1),(33,'ŠET. XIII DIVIZIJE 15','Šetalište XIII divizije 15, 51000, Rijeka, Croatia',45.32344190,14.45672060,NULL,NULL,NULL,1,1),(34,'N. KATUNARA 13','Nike Katunara 13, Rijeka',45.32561670,14.46163760,'','','',1,1),(35,'MAROHNIĆEVA 14','Marohnićeva 14, 51000, Rijeka, Croatia',45.32551100,14.46548900,NULL,NULL,NULL,1,1),(36,'S. KRAUTZEKA 66B','Slavka Krautzeka 66B, 51000, Rijeka, Croatia',45.32650140,14.46487040,NULL,NULL,NULL,1,1),(37,'S. KRAUTZEKA 66C','Slavka Krautzeka 66C, 51000, Rijeka, Croatia',45.32626510,14.46484380,NULL,NULL,NULL,1,1),(38,'S. KRAUTZEKA 66D','Slavka Krautzeka 66D, 51000, Rijeka, Croatia',45.32621100,14.46483750,NULL,NULL,NULL,1,1),(39,'LAGINJINA 19','Laginjina ul. 19, 51000, Rijeka, Croatia',45.33222230,14.43934530,NULL,NULL,NULL,1,1),(40,'DEŽMANOVA 6','Ul. Ivana Dežmana 6, Rijeka',45.32914980,14.44134890,'','','',1,1),(41,'ŠIBENSKA 3','Šibenska ul. 3, Rijeka',45.33938610,14.40911510,'','','',1,1),(42,'B.KAŠIĆA 20','Bartola Kašića 20, Rijeka',45.35349700,14.36798900,'','','',1,1),(43,'MIĆI VOLJAK 4','Ul. Mići Voljak 4, 51000, Rijeka, Croatia',45.33298000,14.44055860,NULL,NULL,NULL,1,1),(44,'RASTOČINE 4','Rastočine ul. 4, 51000, Rijeka, Croatia',45.33929180,14.43178950,NULL,NULL,NULL,1,1),(45,'M. ŠPILERA 1','Ul. Marija Špilera 1, 51000, Rijeka, Croatia',45.34135230,14.41887000,NULL,NULL,NULL,1,1),(46,'N.KATUNARA 6','Nike Katunara 6, Rijeka',45.32543420,14.46284830,'','','',1,1),(47,'A. BENUSSI 2','A. BENUSSI 2, Rijeka',45.32706310,14.44217600,'','','',1,1),(48,'G.CARABINO 7','G.Carabino, 51000, Rijeka, Croatia',45.34180700,14.40346200,NULL,NULL,NULL,1,1),(49,'HEGEDUŠIĆEVA 19','Hegedušićeva ul. 19, Rijeka',45.34285010,14.39404780,'','','',1,1),(50,'M. ALBAHARI 2','Ul. Moše Albaharija, 51000, Rijeka, Croatia',45.33154230,14.43622050,NULL,NULL,NULL,1,1),(51,'F. KURELCA 6','Ul. Frana Kurelca 6, Rijeka',45.32881690,14.44102540,'','','',1,1),(52,'I. DEŽMANA 8','Ul. Ivana Dežmana 8, 51000, Rijeka, Croatia',45.32929800,14.44107880,NULL,NULL,NULL,1,1),(53,'A. MEDULIĆA 6 i 8','Ul. Andrije Medulića 6-8, Rijeka',45.32756490,14.44409810,'','','',1,1),(54,'Z.KUČIĆA 39','Ul. dr. Zdravka Kučića 39, 51000, Rijeka, Croatia',45.32027770,14.47999790,NULL,NULL,NULL,1,1),(55,'MEDOVIĆEVA 15','Medovićeva ul. 15, 51000, Rijeka, Croatia',45.34453460,14.39708900,NULL,NULL,NULL,1,1),(56,'LAGINJINA 8a','Laginjina ul. 8, Rijeka',45.33099170,14.44171640,'','','',1,1),(57,'MEDOVIĆEVA 17','Medovićeva ul. 17, 51000, Rijeka, Croatia',45.34455990,14.39684660,NULL,NULL,NULL,1,1),(58,'KREŠIMIROVA 34','Krešimirova ul. 34, 51000, Rijeka, Croatia',45.33070160,14.43012550,NULL,NULL,NULL,1,1),(59,'F.LA.GUARDIA 2','F. la Guardia 2, Rijeka',45.33029180,14.43521970,'','','',1,1),(60,'MARINA JAKOMINIĆA 3','Ul. Marina Jakominića 3, 51000, Rijeka, Croatia',45.34421930,14.37178960,NULL,NULL,NULL,1,1),(61,'MARINA JAKOMINIĆA 3A','Ul. Marina Jakominića 3A, 51000, Rijeka, Croatia',45.34424580,14.37180300,NULL,NULL,NULL,1,1),(62,'F.LA.GUARDIA 13','F. la Guardia 13, Rijeka',45.33029180,14.43521970,'','','',1,1),(63,'TIZIANOVA 35','Tizianova ul. 35, 51000, Rijeka, Croatia',45.33660510,14.43316970,NULL,NULL,NULL,1,1),(64,'SIMONETTIEVA 1','Simonettieva ul. 1, 51000, Rijeka, Croatia',45.34142050,14.40186500,NULL,NULL,NULL,1,1),(65,'KREŠIMIROVA 58','Krešimirova ul. 58, 51000, Rijeka, Croatia',45.33284240,14.42411470,NULL,NULL,NULL,1,1),(66,'HRV. CRVENI KRIŽ','Brajdica 5, 51000, Rijeka, Croatia',45.32394770,14.44631740,NULL,NULL,NULL,1,1),(67,'GPZ','Ul. Đure Šporera 8, 51000, Rijeka, Croatia',45.32731840,14.44458730,NULL,NULL,NULL,1,1),(68,'VOD. I KANALIZACIJA','Dolac 14, Rijeka',45.32899000,14.43916920,'','','',1,1),(69,'JH SPORT','Brajdica 5/1, 51000, Rijeka, Croatia',45.32396330,14.45432260,NULL,NULL,NULL,1,1),(70,'KD KOZALA d.o.o.','Ul. Braće Hlača 2/a, 51000, Rijeka, Croatia',45.35853930,14.42317190,NULL,NULL,NULL,1,1),(71,'ROBNA KUĆA RI - ADRIA GRUPA d.o.o.','Riva 6, Rijeka',45.32639470,14.44186170,'','','',1,1),(72,'FAST FORWARD d.o.o.','Dražice 123, Rijeka',45.34988830,14.37305480,'','','',1,1),(73,'JAVNI BILJ. PANJKOVIĆ','Ul. Ante Starčevića 4, Rijeka',45.32599910,14.44514760,'','','',1,1),(74,'3 MAJ BRODOG-dizalica','Liburnijska ul. 3, 51000, Rijeka, Croatia',45.33893850,14.39494540,NULL,NULL,NULL,1,1),(75,'PSIH.BOLNICA LOPAČA','Lopača 11, 51218, Dražice, Croatia',45.37797380,14.44101200,NULL,NULL,NULL,1,1),(76,'M – BROS. j.d.o.o.','53B, 51500, Skrbčići, Croatia',45.04917620,14.49211390,'','','',1,1),(77,'DELTA TREND d.o.o.','Bjanižov 3, 51511, Omišalj, Croatia',45.21431880,14.55573850,NULL,NULL,NULL,1,1),(78,'DJ. VRTIĆ KASTAV','Skalini Istarskog Tabora 1, 51215, Kastav, Croatia',45.37210940,14.34723400,NULL,NULL,NULL,1,1),(79,'PSC LOVORKA','Rujevica ul. 6, 51000, Rijeka, Croatia',45.34719120,14.40521420,NULL,NULL,NULL,1,1),(80,'VENTEX d.o.o.','Dražice 123, Rijeka',45.34988830,14.37305480,'','','',1,1),(81,'EKONOMSKI FAKULTET RIJEKA','Ul. Ivana Filipovića 4, Rijeka',45.33164930,14.43480340,'','','',1,1),(82,'LUKA RIJEKA d.d.','Riva 1, Rijeka',45.32712280,14.43727310,'','','',1,1),(83,'PALAČA MOISE CRES','Zagrad 6, 51557 Cres',44.95964100,14.40994060,'','','',1,1),(84,'KOSTRENSKIH BORACA 1','Kostrenskih boraca 1, Kostrena',45.30977360,14.48871100,'','','',1,1),(85,'KOSTRENSKIH BORACA 1A','Boraca 1, 52212, Fažana, Croatia',44.92641990,13.80415280,NULL,NULL,NULL,1,1),(86,'VBZ Knjižara','Korzo 32, 51000, Rijeka, Croatia',45.32760360,14.44035810,NULL,NULL,NULL,1,1),(87,'Žrtava Fašizma 9/h UMAG','Ul. Žrtava fašizma 9h, 52470, Umag, Croatia',45.42779760,13.52730330,NULL,NULL,NULL,1,1),(88,'RUPA HIGIS','90, 51211, Rupa, Croatia',45.47866960,14.28587350,NULL,NULL,NULL,1,1),(89,'HOLCIM KOROMAČNO','7, 52220, Koromačno, Croatia',44.96836340,14.12206270,'','','',1,1);
/*!40000 ALTER TABLE `locations` ENABLE KEYS */;
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
  PRIMARY KEY (`id`),
  KEY `idx_project_sections_project_id` (`project_id`),
  CONSTRAINT `fk_project_sections_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_sections`
--

LOCK TABLES `project_sections` WRITE;
/*!40000 ALTER TABLE `project_sections` DISABLE KEYS */;
INSERT INTO `project_sections` VALUES (1,1,'Pripremni radovi',0),(2,2,'sgsdfgsd',0),(3,2,'aaaa',0);
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
  `project_task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `comment` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_task_comments_task_id` (`project_task_id`),
  KEY `fk_project_task_comments_user` (`user_id`),
  CONSTRAINT `fk_project_task_comments_task` FOREIGN KEY (`project_task_id`) REFERENCES `project_tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_project_task_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_task_comments`
--

LOCK TABLES `project_task_comments` WRITE;
/*!40000 ALTER TABLE `project_task_comments` DISABLE KEYS */;
INSERT INTO `project_task_comments` VALUES (1,1,1,'yybb','2026-02-11 19:28:10');
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
  `project_task_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_project_task_user` (`project_task_id`,`user_id`),
  KEY `idx_project_task_id` (`project_task_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_project_task_users_task` FOREIGN KEY (`project_task_id`) REFERENCES `project_tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_task_users_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_task_users`
--

LOCK TABLES `project_task_users` WRITE;
/*!40000 ALTER TABLE `project_task_users` DISABLE KEYS */;
INSERT INTO `project_task_users` VALUES (1,1,6,'2026-02-11 19:20:45'),(2,3,6,'2026-02-11 19:21:25');
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
  PRIMARY KEY (`id`),
  KEY `idx_project_tasks_section_id` (`project_section_id`),
  KEY `fk_project_tasks_assigned_user` (`assigned_user_id`),
  CONSTRAINT `fk_project_tasks_assigned_user` FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_project_tasks_section` FOREIGN KEY (`project_section_id`) REFERENCES `project_sections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `project_tasks`
--

LOCK TABLES `project_tasks` WRITE;
/*!40000 ALTER TABLE `project_tasks` DISABLE KEYS */;
INSERT INTO `project_tasks` VALUES (1,2,'gGG','GG',NULL,1,'2026-02-11 19:24:06',0,'2026-02-11 19:20:45'),(2,2,'BbBb','ffsGsgadgad',NULL,1,'2026-02-11 21:11:37',0,'2026-02-11 19:21:01'),(3,3,'Isprazni oknp','ispraziniti sve !',NULL,1,'2026-02-11 21:11:42',0,'2026-02-11 19:21:25');
/*!40000 ALTER TABLE `project_tasks` ENABLE KEYS */;
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
  `status` enum('active','completed','archived') NOT NULL DEFAULT 'active',
  `start_date` date DEFAULT NULL,
  `expected_end_date` date DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_projects_company_id` (`company_id`),
  KEY `fk_projects_location` (`location_id`),
  KEY `fk_projects_created_by` (`created_by`),
  CONSTRAINT `fk_projects_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_projects_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_projects_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `projects`
--

LOCK TABLES `projects` WRITE;
/*!40000 ALTER TABLE `projects` DISABLE KEYS */;
INSERT INTO `projects` VALUES (1,1,'Njivice Alfred - struja','Izvodenje elektroinstalacija u kuci sa 2 stana na 2 kata + podrum',NULL,'active','2026-02-11','2026-03-27',1,'2026-02-11 18:32:04'),(2,1,'sdgsg','sgsdgsgs',NULL,'active',NULL,NULL,1,'2026-02-11 18:56:47'),(3,1,'dsvafaf','asfasf',10,'active',NULL,NULL,1,'2026-02-11 21:12:00');
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
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rms_visit_items`
--

LOCK TABLES `rms_visit_items` WRITE;
/*!40000 ALTER TABLE `rms_visit_items` DISABLE KEYS */;
INSERT INTO `rms_visit_items` VALUES (1,2,'D1','O.K.','ok','2026-02-04 20:55:16',1),(2,7,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','fafasfaf','2026-02-04 21:07:29',1),(3,7,'D2 (neparni / odd)','O.K.',NULL,'2026-02-04 21:07:29',1),(4,8,'D1 (parni / even)','Potreban popravak - Dizalo nije u funkciji','ovo stvarno ne radi','2026-02-04 21:08:29',1),(5,8,'D2 (neparni / odd)','O.K.',NULL,'2026-02-04 21:08:29',1),(6,9,'D1 (parni / even)','Potreban popravak - Dizalo nije u funkciji','danasnji test','2026-02-05 15:40:35',1),(7,9,'D2 (neparni / odd)','Potreban popravak - Dizalo u funkciji',NULL,'2026-02-05 15:40:35',1),(8,10,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','opopopopopopop','2026-02-05 16:14:35',1),(9,10,'D2 (neparni / odd)','O.K.',NULL,'2026-02-05 16:14:35',1),(10,11,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','TREBA PROVJERITI !','2026-02-05 18:52:51',1),(11,11,'D2 (neparni / odd)','O.K.',NULL,'2026-02-05 18:52:51',1),(12,12,'D1 (parni / even)','O.K.','Sad je OK','2026-02-05 23:02:19',1),(13,12,'D2 (neparni / odd)','O.K.',NULL,'2026-02-05 23:02:19',1),(14,13,'D1 (parni / even)','Potreban popravak - Dizalo nije u funkciji',NULL,'2026-02-05 23:19:04',1),(15,13,'D2 (neparni / odd)','Potreban popravak - Dizalo u funkciji',NULL,'2026-02-05 23:19:04',1),(16,14,'D1 (parni / even)','Potreban popravak - Dizalo u funkciji','6th floor lock chanfge.','2026-02-10 13:10:30',1),(17,14,'D2 (neparni / odd)','O.K.',NULL,'2026-02-10 13:10:30',1);
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
  PRIMARY KEY (`id`),
  KEY `idx_rms_visits_location` (`location_id`),
  KEY `idx_rms_visits_company_id` (`company_id`),
  CONSTRAINT `fk_rms_visits_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rms_visits`
--

LOCK TABLES `rms_visits` WRITE;
/*!40000 ALTER TABLE `rms_visits` DISABLE KEYS */;
INSERT INTO `rms_visits` VALUES (2,30,NULL,'2026-02-04 00:00:00',NULL,'test','2026-02-04 20:55:16',1),(7,30,NULL,'2026-02-04 00:00:00',NULL,NULL,'2026-02-04 21:07:29',1),(8,30,NULL,'2026-02-04 00:00:00',NULL,NULL,'2026-02-04 21:08:29',1),(9,30,NULL,'2026-02-05 00:00:00',NULL,NULL,'2026-02-05 15:40:35',1),(10,30,NULL,'2026-02-05 00:00:00',NULL,NULL,'2026-02-05 16:14:35',1),(11,30,NULL,'2026-02-05 00:00:00',NULL,NULL,'2026-02-05 18:52:51',1),(12,30,NULL,'2026-02-06 00:00:00',NULL,NULL,'2026-02-05 23:02:19',1),(13,30,NULL,'2026-02-06 00:00:00',NULL,NULL,'2026-02-05 23:19:04',1),(14,30,NULL,'2026-02-10 00:00:00',NULL,NULL,'2026-02-10 13:10:30',1);
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
INSERT INTO `sessions` VALUES ('HqBK5Z_u4j8GAL-Ff-hT42cuVd4fjyNJ',1770931101,'{\"cookie\":{\"originalMaxAge\":null,\"expires\":null,\"secure\":false,\"httpOnly\":true,\"path\":\"/\"},\"user\":{\"id\":1,\"username\":\"admin\",\"role\":\"admin\",\"company_id\":1}}'),('ppH-utycdhBothRmS8o4Tu1Cf7l3rcnl',1771954641,'{\"cookie\":{\"originalMaxAge\":2592000000,\"expires\":\"2026-02-12T09:29:10.246Z\",\"secure\":false,\"httpOnly\":true,\"path\":\"/\",\"sameSite\":\"lax\"},\"user\":{\"id\":1,\"username\":\"admin\",\"role\":\"admin\",\"full_name\":\"Administrator\"}}');
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
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
  `role` enum('admin','technician') NOT NULL DEFAULT 'technician',
  `full_name` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL,
  `disabled_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_users_company_id` (`company_id`),
  CONSTRAINT `fk_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2b$10$bNTvuVh9ZziFhRYS3aVJMuNqj1IddT.Vlu6u9rIhQkojCqRqZcRxu','admin','Administrator','2026-01-11 18:51:36',1,NULL),(3,'admin2','$2b$10$7fEoA7zvV5nW0etw97fBOe5JUk/6F2ThAi8T2bIt7uI0z0ndR5Ih2','admin','Rezervni Admin','2026-01-12 18:34:08',1,NULL),(5,'Testni lik','$2b$10$Lm08Y0KboOgYEpkzVKPP9u/oCMTXZZa1Vt8Qxp47ZsMCj6urAAHKK','technician','Testni lik','2026-01-25 23:25:34',1,'2026-02-06 13:56:02'),(6,'ranjith','$2b$10$6TAaSshm6PrZ4IiobgF0dulgPJr/SF8wzQbnne9P5/am9dXBWjPDO','technician','Ranjith','2026-01-26 12:56:31',1,NULL);
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
INSERT INTO `vehicles` VALUES (1,1,'Ford Transit','/uploads/vehicle-images/1-1.jpg',2020,'2026-02-03','2027-02-03','2026-02-11 17:58:05');
/*!40000 ALTER TABLE `vehicles` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_elevators`
--

LOCK TABLES `work_order_elevators` WRITE;
/*!40000 ALTER TABLE `work_order_elevators` DISABLE KEYS */;
INSERT INTO `work_order_elevators` VALUES (1,1,1,6,'2026-02-08 17:25:49');
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
  PRIMARY KEY (`id`),
  KEY `idx_work_order_items_company` (`company_id`),
  KEY `idx_work_order_items_order` (`work_order_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_items`
--

LOCK TABLES `work_order_items` WRITE;
/*!40000 ALTER TABLE `work_order_items` DISABLE KEYS */;
INSERT INTO `work_order_items` VALUES (1,1,1,'Zamjena uznice',1,'2026-02-08 17:25:49');
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_order_users`
--

LOCK TABLES `work_order_users` WRITE;
/*!40000 ALTER TABLE `work_order_users` DISABLE KEYS */;
INSERT INTO `work_order_users` VALUES (1,1,1,6,'2026-02-08 17:25:49');
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
  PRIMARY KEY (`id`),
  KEY `idx_work_orders_company` (`company_id`),
  KEY `idx_work_orders_location` (`location_id`),
  KEY `idx_work_orders_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_orders`
--

LOCK TABLES `work_orders` WRITE;
/*!40000 ALTER TABLE `work_orders` DISABLE KEYS */;
INSERT INTO `work_orders` VALUES (1,1,30,1,'open','2026-02-20','Uznica je u radioni','2026-02-08 17:25:49',NULL,NULL);
/*!40000 ALTER TABLE `work_orders` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-11 22:44:49
