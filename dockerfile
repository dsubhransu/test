FROM ubuntu:16.04
       MAINTAINER dsubhransu.info@gmail.com
       RUN apt-get update -y
       RUN apt-get install vim net-tools openssh-server sudo wget apache2 -y
       RUN apt-get clean
       RUN rm -rf /var/lib/apt/lists/*
       COPY index.html /var/www/html/index.html
       ADD apache.sh /apache.sh        
       CMD ["/bin/bash","/apache.sh"]
