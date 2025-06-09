import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function TestDB() {
  let dbStatus = "Not connected"
  let userCount = 0
  let error = ""
  
  try {
    // Test database connection
    await prisma.$connect()
    userCount = await prisma.user.count()
    dbStatus = "Connected"
  } catch (err: any) {
    console.error('Database connection error:', err)
    dbStatus = "Connection failed"
    error = err.message
  } finally {
    await prisma.$disconnect()
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-4">Database Connection Test</h1>
        
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded">
            <h3 className="font-semibold text-blue-800">Database Status</h3>
            <p className="text-blue-600 text-lg">{dbStatus}</p>
            {error && (
              <p className="text-red-600 text-sm mt-2 font-mono">{error}</p>
            )}
          </div>
          
          <div className="p-4 bg-green-50 rounded">
            <h3 className="font-semibold text-green-800">Total Users</h3>
            <p className="text-green-600 text-lg">{userCount}</p>
          </div>
          
          <div className="p-4 bg-purple-50 rounded">
            <h3 className="font-semibold text-purple-800">Database Info</h3>
            <p className="text-purple-600 text-sm">
              <strong>Provider:</strong> PostgreSQL<br/>
              <strong>Host:</strong> {process.env.DATABASE_URL?.includes('localhost') ? 'localhost (Docker)' : 'Remote'}
            </p>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">
            If you see "Connected" above, your database is working!
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Make sure your Docker PostgreSQL container is running.
          </p>
        </div>
      </div>
    </div>
  )
}