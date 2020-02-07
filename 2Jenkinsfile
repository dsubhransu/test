node{
   stage('SCM Checkout'){
     git 'https://github.com/dsubhransu/test/new/dev'
   }
   stage('Compile-Package'){
      def mvnHome = tool name: 'maven-3', type: 'maven'
      sh "${mvnHome}/bin/mvn package"
   }   
   stage('Email Notification'){
      mail bcc: '', body: 'welcome to jenkins job', cc: '', from: '', replyTo: '', subject: 'report', to: 'saiprasad169@gmail.com'
   }
}   
