pipeline {
    agent any

    stages {
        stage('Setup') {
            steps {
                // Clean workspace before starting
                cleanWs()
                // Checkout code
                checkout scm
                // Install dependencies using clean install
                sh 'npm ci'
            }
        }

        stage('Test') {
            environment {
                // MinIO credentials will be injected from Jenkins credentials
                MINIO_ACCESS_KEY = credentials('minio-test-access-key')
                MINIO_SECRET_KEY = credentials('minio-test-secret-key')
                NODE_ENV = 'test'
                MINIO_BUCKET = 'test-bucket'
                MINIO_ENDPOINT = 'http://minio:9000'
                PORT = '3000'
                JEST_JUNIT_OUTPUT_DIR = 'reports'
                JEST_JUNIT_OUTPUT_NAME = 'junit.xml'
            }
            steps {
                // Create reports directory
                sh 'mkdir -p reports'
                // Run tests with coverage
                sh 'npm run test:coverage'

                // Publish test results and coverage
                junit(testResults: 'reports/junit.xml', allowEmptyResults: true)
                
                publishHTML(target: [
                    allowMissing: true,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: 'coverage/lcov-report',
                    reportFiles: 'index.html',
                    reportName: 'Coverage Report'
                ])

                // Archive artifacts
                archiveArtifacts(
                    artifacts: 'reports/**, coverage/**',
                    allowEmptyArchive: true
                )
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
} 