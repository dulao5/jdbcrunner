/*
 * Tiny sysbench
 * This script is based on sysbench 0.4.12.
 * https://github.com/akopytov/sysbench
 */

// JdbcRunner settings -----------------------------------------------

// Oracle Database
// var jdbcUrl = "jdbc:oracle:thin:@//localhost:1521/orcl.local";

// MySQL
var jdbcUrl = "jdbc:mysql://localhost:3306/sbtest?useSSL=false&allowPublicKeyRetrieval=true";

// PostgreSQL
// var jdbcUrl = "jdbc:postgresql://localhost:5432/sbtest";

var jdbcUser = "sbtest";
var jdbcPass = "sbtest";
var warmupTime = 60;
var measurementTime = 180;
var nAgents = 16;
var stmtCacheSize = 20;
var isAutoCommit = false;
var logDir = "logs";

// Application settings ----------------------------------------------

var DIST_UNIFORM = 1;
var DIST_GAUSSIAN = 2;
var DIST_SPECIAL = 3;

// Number of records in the test table
var oltpTableSize;
// Number of tables in the test
var oltpTableCount;

// Database product name
var databaseProductName;

// Ratio of queries in a transaction
var oltpPointSelects = 10;
var oltpSimpleRanges = 1;
var oltpSumRanges = 1;
var oltpOrderRanges = 1;
var oltpDistinctRanges = 1;
var oltpIndexUpdates = 1;
var oltpNonIndexUpdates = 1;

// Read-only flag
var oltpReadOnly = false;

// Range size for range queries
var oltpRangeSize = 100;

// Parameters for random numbers distribution
var oltpDistType = DIST_SPECIAL;
var oltpDistIter = 12;
var oltpDistPct = 1;
var oltpDistRes = 75;

// JdbcRunner functions ----------------------------------------------

function init() {
    if (getId() == 0) {
        info("Tiny sysbench");
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
        
        putData("DatabaseProductName", getDatabaseProductName());
    }
}

function run() {
    if (!oltpTableSize) {
        oltpTableSize = Number(getData("OLTPTableSize"));
    }
    if (!oltpTableCount) {
        oltpTableCount = Number(getData("OLTPTableCount"));
    }
    
    if (!databaseProductName) {
        databaseProductName = getData("DatabaseProductName");
    }
    
    oltpExecuteRequest();
}

// Application functions ---------------------------------------------

function oltpExecuteRequest() {
    try {
        var tableName = getRandomTableName(oltpTableCount);
        // Point selects
        for (var count = 0; count < oltpPointSelects; count++) {
            var id = getRandomId();
            
            query("SELECT c FROM " + tableName + " WHERE id = $int", id);
        }
        
        // Simple ranges
        for (var count = 0; count < oltpSimpleRanges; count++) {
            var from = getRangeRandomId();
            var to = from + oltpRangeSize - 1;
            
            query("SELECT c FROM " + tableName + " WHERE id BETWEEN $int AND $int", from, to);
        }
        
        // Sum ranges
        for (var count = 0; count < oltpSumRanges; count++) {
            var from = getRangeRandomId();
            var to = from + oltpRangeSize - 1;
            
            query("SELECT SUM(k) FROM " + tableName + " WHERE id BETWEEN $int AND $int", from, to);
        }
        
        // Order ranges
        for (var count = 0; count < oltpOrderRanges; count++) {
            var from = getRangeRandomId();
            var to = from + oltpRangeSize - 1;
            
            query("SELECT c FROM " + tableName + " WHERE id BETWEEN $int AND $int ORDER BY c", from, to);
        }
        
        // Distinct ranges
        for (var count = 0; count < oltpDistinctRanges; count++) {
            var from = getRangeRandomId();
            var to = from + oltpRangeSize - 1;
            
            query("SELECT DISTINCT c FROM " + tableName + " WHERE id BETWEEN $int AND $int ORDER BY c",
                from, to);
        }
        
        if (!oltpReadOnly) {
            // Index updates
            for (var count = 0; count < oltpIndexUpdates; count++) {
                var id = getRandomId();
                
                execute("UPDATE " + tableName + " SET k = k + 1 WHERE id = $int", id);
            }
            
            // Non index updates
            for (var count = 0; count < oltpNonIndexUpdates; count++) {
                var c = getRandomString();
                var id = getRandomId();
                
                execute("UPDATE " + tableName + " SET c = $string WHERE id = $int", c, id);
            }
            
            // Delete and insert
            var deletedCount = 0;
            var id = getRandomId();
            deletedCount = execute("DELETE FROM " + tableName + " WHERE id = $int", id);
            if (deletedCount > 0) {
                execute("INSERT INTO " + tableName + " (id, k, c, pad) VALUES ($int, 0, ' ', "
                    + "'aaaaaaaaaaffffffffffrrrrrrrrrreeeeeeeeeeyyyyyyyyyy')", id);
            }
        }
        
        // Commit
        commit();
    } catch (e) {
        if (isIgnoreError(e)) {
            warn("[Agent " + getId() + "] ignore error" + String(e));
            try { rollback(); } catch (e) {}
        } else {
            warn("[Agent " + getId() + "] other error" + String(e));
            error(e + getScriptStackTrace(e));
        }
    }
}

function getRandomString() {
    return "" + sbRnd() + "-" + sbRnd() + "-" + sbRnd() + "-" + sbRnd() + "-" + sbRnd()
        + "-" + sbRnd() + "-" + sbRnd() + "-" + sbRnd() + "-" + sbRnd() + "-" + sbRnd();
}

function getRangeRandomId() {
    var id = getRandomId();
    
    if (id + oltpRangeSize > oltpTableSize) {
        id = oltpTableSize - oltpRangeSize;
    }
    
    if (id < 1) {
        id = 1;
    }
    
    return id;
}

function getRandomId() {
    var r = 0;
    
    switch (oltpDistType) {
        case DIST_UNIFORM:
            r = rndFuncUniform();
            break;
        case DIST_GAUSSIAN:
            r = rndFuncGaussian();
            break;
        case DIST_SPECIAL:
            r = rndFuncSpecial();
            break;
        default:
            r = 0;
    }
    
    return r;
}

function getRandomTableName(oltpTableCount) {
    var tableId = Math.floor(Math.random() * oltpTableCount) + 1;
    return "sbtest" + tableId;
}

function rndFuncUniform() {
    return 1 + sbRnd() % oltpTableSize;
}

function rndFuncGaussian() {
    var sum = 0;
    
    for (var i = 0; i < oltpDistIter; i++) {
        sum += 1 + sbRnd() % oltpTableSize;
    }
    
    return Math.floor(sum / oltpDistIter);
}

function rndFuncSpecial() {
    var sum = 0;
    var d = 0;
    var res = 0;
    var rangeSize = 0;
    
    if (oltpTableSize == 0) {
        return 0;
    }
    
    rangeSize = oltpTableSize * Math.floor(100 / (100 - oltpDistRes));
    res = 1 + sbRnd() % rangeSize;
    
    if (res <= oltpTableSize) {
        for (var i = 0; i < oltpDistIter; i++) {
            sum += 1 + sbRnd() % oltpTableSize;
        }
        
        return Math.floor(sum / oltpDistIter);
    }
    
    d = Math.floor(oltpTableSize * oltpDistPct / 100);
    
    if (d < 1) {
        d = 1;
    }
    
    res %= d;
    res += Math.floor(oltpTableSize / 2) - Math.floor(oltpTableSize * oltpDistPct / 200);
    
    return res;
}

function sbRnd() {
    return random(0, 1073741822);
}

function isIgnoreError(exception) {
    // Non-SQLException

    var ignoreErrorTypeRegs = [
        /com\.mysql\.cj\.jdbc\.exceptions\.MySQLTransactionRollbackException/,
        /com\.mysql\.cj\.jdbc\.exceptions\.CommunicationsException/,
        /java\.net\.SocketTimeoutException/,
        /PessimisticLockNotFound/,
        /TxnLockNotFound/,
        /java\.sql\.SQLException/,
    ];
    var exceptionType = String(exception);
    for (var i = 0; i < ignoreErrorTypeRegs.length; i++) {
        if (ignoreErrorTypeRegs[i].test(exceptionType)) {
            return true;
        }
    }

    // SQLException

    var ignoreSQLExceptionConfig = {
        "Oracle": [
            60 // Deadlock
        ],
        "MySQL": [
            1213, // Deadlock
            2013, // connection lost
            9007  // conflict
        ],
        "PostgreSQL": [
            "40P01" // deadlock
        ],
    }
    var javaException = exception.javaException;
    
    if (javaException instanceof java.sql.SQLException) {
        var ignoreErrorCodes = ignoreSQLExceptionConfig[databaseProductName];
        var errorCode;
        switch(databaseProductName) {
            case "Oracle":
            case "MySQL":
                errorCode = javaException.getErrorCode();
                break;
            case "PostgreSQL":
                errorCode = javaException.getSQLState();
                break;
            default:
                return false;
        }
        return (ignoreErrorCodes.indexOf(errorCode) != -1);
    } else {
        return false;
    }
}
