pipeline {
    agent any

    environment {
        NODE_VERSION = '18'  // Specify Node.js version
        // MinIO credentials will be injected from Jenkins credentials
        MINIO_ACCESS_KEY = credentials('minio-test-access-key')
        MINIO_SECRET_KEY = credentials('minio-test-secret-key')
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials') // ID in Jenkins for DockerHub creds
    }

    stages {
        stage('Setup') {
            steps {
                script {
                    // Ensure we're in a node block
                    node {
                        checkout scm
                        // Install dependencies using clean install
                        sh 'npm ci'
                    }
                }
            }
        }

        stage('Lint') {
            steps {
                // Add linting if you have ESLint configured
                sh 'npm run lint || echo "No lint configuration found"'
            }
        }

        stage('Test') {
            steps {
                script {
                    node {
                        // Set up environment variables
                        withEnv([
                            "NODE_ENV=test",
                            "MINIO_BUCKET=test-bucket",
                            "MINIO_ENDPOINT=http://minio:9000",
                            "PORT=3000",
                            "JEST_JUNIT_OUTPUT_DIR=reports",
                            "JEST_JUNIT_OUTPUT_NAME=junit.xml"
                        ]) {
                            // Create reports directory
                            sh 'mkdir -p reports'
                            // Run tests with coverage
                            sh 'npm run test:coverage'
                        }

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
            script {
                node {
                    cleanWs()
                }
            }
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
} 