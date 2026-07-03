require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 3000


app.use(cors());
app.use(express.json());



app.get('/projects', async(req,res)=>{
    const cursor = projectsCollection.find();
    const result = await cursor.toArray();
    res.send(result) ;
})


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})