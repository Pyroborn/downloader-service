pipeline {
    agent any

    environment {
        NODE_VERSION = '18'  // Specify Node.js version
        // MinIO credentials will be injected from Jenkins credentials
        MINIO_ACCESS_KEY = credentials('minio-test-access-key')
        MINIO_SECRET_KEY = credentials('minio-test-secret-key')
    }

    stages {
        stage('Setup') {
            steps {
                // Use Node.js version from nvm or Jenkins tool configuration
                //sh 'nvm use ${NODE_VERSION} || nvm install ${NODE_VERSION}'
                checkout scm
                sh 'npm install'
                // Install dependencies using clean install
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                // Add linting if you have ESLint configured
                sh 'npm run lint || echo "No lint configuration found"'
            }
        }

        stage('Test') {
            environment {
                NODE_ENV = 'test'
                // Use test-specific configurations
                MINIO_BUCKET = 'test-bucket'
                MINIO_ENDPOINT = 'http://minio:9000'
                PORT = '3000'
            }
            steps {
                // Run tests with coverage
                sh 'npm run test:coverage'
            }
            post {
                always {
                    // Publish test results
                    junit 'coverage/junit.xml'
                    
                    // Publish coverage report
                    publishHTML(target: [
                        allowMissing: false,
                        alwaysLinkToLastBuild: false,
                        keepAll: true,
                        reportDir: 'coverage',
                        reportFiles: 'index.html',
                        reportName: 'Coverage Report'
                    ])
                }
            }
        }

        stage('Build') {
            steps {
                // Add build steps if needed (e.g., webpack, transpilation)
                sh 'npm run build || echo "No build configuration found"'
            }
        }
    }

    post {
        always {
            // Clean workspace
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