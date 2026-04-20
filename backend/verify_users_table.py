import psycopg2

conn = psycopg2.connect(
    dbname='projecthub',
    user='postgres',
    password='secret',
    host='localhost'
)

cursor = conn.cursor()
query = 'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position;'

cursor.execute(query, ('users',))
rows = cursor.fetchall()

print(f"{'Column Name':<30} {'Data Type':<20} {'Nullable':<10}")
print('=' * 60)
for row in rows:
    print(f'{row[0]:<30} {row[1]:<20} {row[2]:<10}')

print(f'\nTotal columns: {len(rows)}')

cursor.close()
conn.close()
