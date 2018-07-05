node {
   def app 
   stage('Clone repository') {
       /* Let's make sure we have the repository cloned to our workspace */     
      checkout scm
   }   
   
   stage('Build image') {
       /* This builds the actual image; synonymous to
         docker build on the command line. */          
       sh 'docker-compose up --build -d'
         /* sh 'docker build -t test .' */         
   }
   
}
