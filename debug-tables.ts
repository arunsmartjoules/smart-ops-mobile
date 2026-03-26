// Debug script to check PowerSync tables
import { powerSync } from './database';

async function debugTables() {
  try {
    // Get all table names from PowerSync
    const result = await powerSync.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    
    console.log('=== PowerSync Tables ===');
    console.log(JSON.stringify(result.rows?._array || [], null, 2));
    
    // Try to query user_sites
    try {
      const userSitesResult = await powerSync.execute('SELECT * FROM user_sites LIMIT 1');
      console.log('user_sites table exists:', userSitesResult.rows?._array);
    } catch (e) {
      console.log('user_sites table error:', e);
    }
    
    // Try to query userSites
    try {
      const userSitesResult2 = await powerSync.execute('SELECT * FROM userSites LIMIT 1');
      console.log('userSites table exists:', userSitesResult2.rows?._array);
    } catch (e) {
      console.log('userSites table error:', e);
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugTables();
