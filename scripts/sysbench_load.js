/*
 * Tiny sysbench - data loader
 * This script is based on sysbench 0.4.12.
 * https://github.com/akopytov/sysbench
 *
 * [Oracle Database]
 * shell> sqlplus "/ AS SYSDBA"
 * sql> CREATE USER sbtest IDENTIFIED BY sbtest;
 * sql> GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE TRIGGER, UNLIMITED TABLESPACE TO sbtest;
 *
 * [MySQL]
 * shell> mysql -u root -p
 * sql> CREATE DATABASE sbtest;
 * sql> CREATE USER sbtest@'%' IDENTIFIED BY 'sbtest';
 * sql> GRANT ALL PRIVILEGES ON sbtest.* TO sbtest@'%';
 *
 * [PostgreSQL]
 * shell> psql -U postgres
 * sql> CREATE DATABASE sbtest TEMPLATE template0 ENCODING 'UTF-8' LC_COLLATE 'C' LC_CTYPE 'C';
 * sql> CREATE USER sbtest PASSWORD 'sbtest';
 *
 * <postgresql.conf>
 * listen_addresses = '*'
 * port = 5432
 *
 * <pg_hba.conf>
 * host all all 0.0.0.0/0 md5
 */

// JdbcRunner settings -----------------------------------------------

// Oracle Database
// var jdbcUrl = "jdbc:oracle:thin:@//localhost:1521/orcl.local";

// MySQL
var jdbcUrl = "jdbc:mysql://localhost:3306/sbtest?useSSL=false&allowPublicKeyRetrieval=true&rewriteBatchedStatements=true";

// PostgreSQL
// var jdbcUrl = "jdbc:postgresql://localhost:5432/sbtest";

var jdbcUser = "sbtest";
var jdbcPass = "sbtest";
var isLoad = true;
var isAutoCommit = false;
var logDir = "logs";
var nAgents = 16;

// Application settings ----------------------------------------------

var BATCH_SIZE = 100;
var COMMIT_SIZE = 1000;

var oltpTableSize;
var oltpTableCount;

// JdbcRunner functions ----------------------------------------------

function init() {
    var agentId = getId();
    info("init() : agent " + agentId);

    if (getId() == 0) {
        info("Tiny sysbench - data loader");
        info("-nAgents: Number of Agents  (default: 16)");
        info("-param0 : Number of records (default : 10000)");
        info("-param1 : Number of tables (default : 32)");

        oltpTableSize = param0;
        oltpTableCount = param1;

        if (oltpTableSize == 0) {
            oltpTableSize = 10000;
        }
        putData("OLTPTableSize", oltpTableSize);
        if (oltpTableCount == 0) {
            oltpTableCount = 32;
        }
        putData("OLTPTableCount", oltpTableCount);

        info("Number of records : " + oltpTableSize);
        info("Number of tables : " + oltpTableCount);

        for (var tableId = 1; tableId <= oltpTableCount; tableId++) {
            if (getDatabaseProductName() == "Oracle") {
                dropTableOracle(tableId);
                createTableOracle(tableId);
            } else if (getDatabaseProductName() == "MySQL") {
                dropTableMySQL(tableId);
                createTableMySQL(tableId);
            } else if (getDatabaseProductName() == "PostgreSQL") {
                dropTablePostgreSQL(tableId);
                createTablePostgreSQL(tableId);
            } else {
                error(getDatabaseProductName() + " is not supported yet.");
            }
        }
        
        commit();
    }
}

function run() {
    if (!oltpTableSize) {
        oltpTableSize = Number(getData("OLTPTableSize"));
    }
    if (!oltpTableCount) {
        oltpTableCount = Number(getData("OLTPTableCount"));
    }
    var agentId = getId();
    info("run : agent " + agentId);
    for (var tableId = agentId + 1; tableId <= oltpTableCount; tableId += nAgents) {
        var tableName = "sbtest" + tableId;
        info("Loading " + tableName + "...");
        
        var k = new Array();
        var c = new Array();
        var pad = new Array();
        
        for (var count = 1; count <= oltpTableSize; count++) {
            k.push(0);
            c.push(" ");
            pad.push("qqqqqqqqqqwwwwwwwwwweeeeeeeeeerrrrrrrrrrtttttttttt");
            
            if (count % BATCH_SIZE == 0) {
                executeBatch("INSERT INTO " + tableName + " (k, c, pad) VALUES ($int, $string, $string)",
                    k, c, pad);
                
                k.length = 0;
                c.length = 0;
                pad.length = 0;
                
                if (count % COMMIT_SIZE == 0) {
                    commit();
                    info(tableName + " : " + count + " / " + oltpTableSize);
                }
            }
        }
        
        if (oltpTableSize % COMMIT_SIZE != 0) {
            if (oltpTableSize % BATCH_SIZE != 0) {
                executeBatch("INSERT INTO " + tableName + " (k, c, pad) VALUES ($int, $string, $string)",
                    k, c, pad);
            }
            
            commit();
            info(tableName + " : " + oltpTableSize + " / " + oltpTableSize);
        }
    }
    
    setBreak();
}

function fin() {
    var agentId = getId();
    info("fin() : agent " + agentId);
    info("oltpTableCount: " + oltpTableCount);
    for (var tableId = agentId + 1; tableId <= oltpTableCount; tableId += nAgents) {
        if (getDatabaseProductName() == "Oracle") {
            createIndexOracle(tableId);
            gatherStatsOracle();
        } else if (getDatabaseProductName() == "MySQL") {
            createIndexMySQL(tableId);
            gatherStatsMySQL(tableId);
        } else if (getDatabaseProductName() == "PostgreSQL") {
            createIndexPostgreSQL(tableId);
            gatherStatsPostgreSQL(tableId);
        } else {
            error(getDatabaseProductName() + " is not supported yet.");
        }
    }
    commit();
    info("agent " + agentId + " Completed");
}

// Application functions ---------------------------------------------

function dropTableOracle(tableId) {
    var tableName = "sbtest" + tableId;
    info("Dropping a table " + tableName + " ...");
    
    try {
        execute("DROP TABLE " + tableName + "");
        execute("DROP SEQUENCE " + tableName + "_seq");
    } catch (e) {
        warn(e);
    }
}

function dropTableMySQL(tableId) {
    var tableName = "sbtest" + tableId;
    info("Dropping a table " + tableName + " ...");
    
    try {
        execute("DROP TABLE " + tableName + "");
    } catch (e) {
        warn(e);
        rollback(); // PostgreSQL requires a rollback.
    }
}

function dropTablePostgreSQL(tableId) {
    dropTableMySQL(tableId);
}

function createTableOracle(tableId) {
    var tableName = "sbtest" + tableId;
    info("Creating a " + tableName + " ...");
    
    execute("CREATE TABLE " + tableName + " ("
        + "id NUMBER, "
        + "k NUMBER DEFAULT 0 NOT NULL, "
        + "c CHAR(120) DEFAULT '' NOT NULL, "
        + "pad CHAR(60) DEFAULT '' NOT NULL)");
    
    execute("CREATE SEQUENCE " + tableName + "_seq");
    
    var statement;
    
    try {
        statement = takeConnection().createStatement();
        
        statement.executeUpdate("CREATE TRIGGER " + tableName + "_trig "
            + "BEFORE INSERT ON " + tableName + " FOR EACH ROW "
            + "BEGIN "
                + "IF :NEW.id IS NULL THEN "
                    + "SELECT " + tableName + "_seq.NEXTVAL INTO :NEW.id FROM DUAL; "
                + "END IF; "
            + "END;");
    } finally {
        try {
            statement.close();
        } catch (e) {
            warn(e);
        }
    }
}

function createTableMySQL(tableId) {
    var tableName = "sbtest" + tableId;
    info("Creating a " + tableName + " ...");
    
    execute("CREATE TABLE " + tableName + " ("
        + "id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, "
        + "k INT UNSIGNED DEFAULT 0 NOT NULL, "
        + "c CHAR(120) DEFAULT '' NOT NULL, "
        + "pad CHAR(60) DEFAULT '' NOT NULL) "
        + "ENGINE = InnoDB");
}

function createTablePostgreSQL(tableId) {
    var tableName = "sbtest" + tableId;
    info("Creating a " + tableName + " ...");
    
    execute("CREATE TABLE " + tableName + " ("
        + "id SERIAL, "
        + "k INTEGER DEFAULT 0 NOT NULL, "
        + "c CHAR(120) DEFAULT '' NOT NULL, "
        + "pad CHAR(60) DEFAULT '' NOT NULL)");
}

function createIndexOracle(tableId) {
    var tableName = "sbtest" + tableId;
    info("Creating an index for " + tableName + " ...");
    
    execute("ALTER TABLE " + tableName + " ADD CONSTRAINT " + tableName + "_pk PRIMARY KEY (id)");
    execute("CREATE INDEX " + tableName + "_ix1 ON " + tableName + " (k)");
}

function createIndexMySQL(tableId) {
    var tableName = "sbtest" + tableId;
    info("Creating an index for " + tableName + " ...");
    
    execute("ALTER TABLE " + tableName + " ADD KEY " + tableName + "_ix1 (k)");
}

function createIndexPostgreSQL(tableId) {
    createIndexOracle(tableId);
}

function gatherStatsOracle() {
    info("Analyzing a table ...");
    
    execute("BEGIN DBMS_STATS.GATHER_SCHEMA_STATS(ownname => NULL); END;");
}

function gatherStatsMySQL(tableId) {
    var tableName = "sbtest" + tableId;
    info("Analyzing a table " + tableName + " ...")
    
    execute("ANALYZE TABLE " + tableName);
}

function gatherStatsPostgreSQL(tableId) {
    var tableName = "sbtest" + tableId;
    info("Vacuuming and analyzing a table " + tableName + " ...");
    
    takeConnection().setAutoCommit(true);
    execute("VACUUM ANALYZE " + tableName);
    takeConnection().setAutoCommit(false);
}
