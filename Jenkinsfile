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
        
        stage('Build Image') {
            steps {
                script {
                    // Build the Docker image
                    sh 'docker build -t downloader-service:${BUILD_NUMBER} .'
                }
            }
        }
        
        stage('Security Scan') {
            steps {
                script {
                    // Create directory for Trivy reports
                    sh 'mkdir -p security-reports'
                    
                    // Run Trivy scan but continue even if vulnerabilities are found
                    sh '''
                        # Install Trivy if not already installed (only needed first time)
                        if ! command -v trivy &> /dev/null; then
                            echo "Trivy not found, installing..."
                            curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /tmp
                            export PATH=$PATH:/tmp
                        fi
                        
                        # Run Trivy scan and output to HTML and JSON reports
                        trivy image --no-progress --exit-code 0 --format template --template "@/tmp/trivy/contrib/html.tpl" -o security-reports/trivy-report.html downloader-service:${BUILD_NUMBER}
                        trivy image --no-progress --exit-code 0 --format json -o security-reports/trivy-report.json downloader-service:${BUILD_NUMBER}
                        
                        echo "Security scan completed - results won't fail the build"
                    '''
                    
                    // Publish HTML report
                    publishHTML(target: [
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'security-reports',
                        reportFiles: 'trivy-report.html',
                        reportName: 'Trivy Security Scan'
                    ])
                    
                    // Archive security reports
                    archiveArtifacts(
                        artifacts: 'security-reports/**',
                        allowEmptyArchive: true
                    )
                }
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