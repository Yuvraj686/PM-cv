import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get DATABASE_URL from .env
database_url = os.getenv('DATABASE_URL')
print(f"Original DATABASE_URL: {database_url}")

# Convert asyncpg URL to psycopg2 format
# Replace 'postgresql+asyncpg://' with 'postgresql://'
sync_url = database_url.replace('postgresql+asyncpg://', 'postgresql://')
print(f"Sync DATABASE_URL: {sync_url}")

# Parse the connection string
# Format: postgresql://username:password@host:port/database
try:
    conn = psycopg2.connect(sync_url)
    print("Connected to database successfully!")
    
    # Create cursor
    cur = conn.cursor()
    
    # Execute query to get column names
    query = "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;"
    cur.execute(query)
    
    # Fetch all results
    columns = cur.fetchall()
    
    print("\n=== Users Table Columns ===")
    for col in columns:
        print(f"  {col[0]}")
    
    print(f"\nTotal columns: {len(columns)}")
    
    # Close connections
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
