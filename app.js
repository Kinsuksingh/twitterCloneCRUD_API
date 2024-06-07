const path = require('path')
const { format } = require('date-fns');
const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { error } = require('console')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname,'twitterClone.db')

let db = null
const port = 3000
const initializeDbAndServer = async () => {
    try{
        db = await open({
            filename : dbPath,
            driver : sqlite3.Database
        })
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}/`)
        })
    }catch(error){
        console.log(`Error in connecting database: ${error.message}`)
        process.exit(1)
    }
}

initializeDbAndServer()

// API = 1
app.post('/register/', async (req,res) => {
    const {username, password, name, gender} = req.body;
    const checkUserQuery = `SELECT username FROM user WHERE username = '${username}'`
    const userChecking = await db.get(checkUserQuery)
    if(userChecking){
        res.status(400)
        res.send('User already exists')
    }else{
        if(password.length < 6){
            res.status(400)
            res.send('Password is too short')
        }else{
            const hashPassword = await bcrypt.hash(password, 10)
            const addingNewUser = `INSERT INTO user (username, password, name, gender) VALUES ('${username}', '${hashPassword}', '${name}', '${gender}');`
            await db.run(addingNewUser)
            res.status(200)
            res.send('User created successfully')
        }
    }
})


// API = 2
app.post('/login/', async (req,res) => {
    const {username, password} = req.body
    const checkUserQuery = `SELECT * FROM user WHERE username = '${username}'`
    const userChecking = await db.get(checkUserQuery)
    if(userChecking){
        const isMatch = await bcrypt.compare(password,userChecking.password)
        if(isMatch){
            const payload = {username:userChecking.username}
            const jwtToken = jwt.sign(payload, 'secret_key')
            res.send({jwtToken:jwtToken})
        }else{
            res.status(400)
            res.send('Invalid password')
        }
    }else{
        res.status(400)
        res.send('Invalid user')
    }
})



const authentication = async (req, res, next) => {
    const authHeared = req.headers['authorization']
    if(authHeared){
        const jwtToken = authHeared.split(" ")[1]
        jwt.verify(jwtToken, 'secret_key', async (error,payload) => {
            if(error){
                res.status(401)
                res.send('Invalid JWT Token')
            }else{
                const userDetailsQuery = `SELECT * FROM user WHERE username = '${payload.username}'`
                try{
                    const userDetails = await db.get(userDetailsQuery)
                    req.userDetails = userDetails
                    next()
                }catch(error){
                    console.log(error.message)
                }
                
            }
        })
    }else{
        res.status(401)
        res.send('Invalid JWT Token')
    }
}






// API = 3   ---> Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get('/user/tweets/feed/', authentication, async (req,res) => {
    const loginUserDetails = req.userDetails
    const followingUserIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${loginUserDetails.user_id}`
    let followingUserIdList = null
    try{
        followingUserIdList = await db.all(followingUserIdQuery)
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error retrieving followers' });
    }
    const followingUserIds = followingUserIdList.map(follower => follower.following_user_id)
    const query = `SELECT  u.username, t.tweet, t.date_time as dateTime
    FROM tweet AS t
    INNER JOIN user AS u ON t.user_id = u.user_id
    WHERE t.user_id IN (${followingUserIds.join(', ')})
    ORDER BY t.date_time DESC
    LIMIT 4`
    try{
        const gettingTweetsFromFollowingUser = await db.all(query)
        res.send(gettingTweetsFromFollowingUser)
    }catch(err){
        console.log(err.message)
        return res.status(500).json({ message: 'Error retrieving tweets' });
    }
    
})


// API = 4  ---> Returns the list of all names of people whom the user follows
app.get('/user/following/', authentication, async (req,res) => {
    const userDetails = req.userDetails
    const followingUserIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userDetails.user_id}`
    let followingUserIdList = null
    try{
        followingUserIdList = await db.all(followingUserIdQuery)
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error retrieving followers' });
    }
    const followingUserIds = followingUserIdList.map(follower => follower.following_user_id)
    const query = `SELECT  username as name
    FROM user
    WHERE user_id IN (${followingUserIds.join(', ')});`
    try{
        const gettingTweetsFromFollowingUser = await db.all(query)
        res.send(gettingTweetsFromFollowingUser)
    }catch(err){
        console.log(err.message)
        return res.status(500).json({ message: 'Error retrieving tweets' });
    }
})


// API = 5  ---> Returns the list of all names of people who follows the user
app.get('/user/followers/', authentication, async (req,res) => {
    const userDetails = req.userDetails
    const followerUserIdQuery = `SELECT follower_user_id FROM follower WHERE following_user_id = ${userDetails.user_id}`
    let followerUserIdList = null
    try{
        followerUserIdList = await db.all(followerUserIdQuery)
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error retrieving followers' });
    }
    const followerUserIds = followerUserIdList.map(follower => follower.follower_user_id)
    const query = `SELECT  username as name
    FROM user
    WHERE user_id IN (${followerUserIds.join(', ')});`
    try{
        const gettingTweetsFromFollowerUser = await db.all(query)
        res.send(gettingTweetsFromFollowerUser)
    }catch(err){
        console.log(err.message)
        return res.status(500).json({ message: 'Error retrieving tweets' });
    }
})


// API = 6 ---> If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time
app.get('/tweets/:tweetId/', authentication, async (req,res) => {
    const {tweetId} = req.params
    const userDetails = req.userDetails
    const followingUserIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userDetails.user_id}`
    let followingUserIdList = null
    try{
        followingUserIdList = await db.all(followingUserIdQuery)
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error retrieving followers' });
    }
    const followingUserIds = followingUserIdList.map(follower => follower.following_user_id)
    const query = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
    try{
        const uId = await db.get(query)
        if(uId.user_id in followingUserIds){
            let l = []
            let queryForRes = `SELECT tweet, date_time FROM tweet WHERE tweet_id = ${tweetId}`
            let response = await db.get(queryForRes)
            l.push(response)

            queryForRes = `SELECT COUNT(like_id) as likes FROM like WHERE tweet_id = ${tweetId}`
            response = await db.get(queryForRes)
            l.push(response)

            queryForRes = `SELECT COUNT(reply_id) as replies FROM reply WHERE tweet_id = ${tweetId}`
            response = await db.get(queryForRes)
            l.push(response)
            
            const responseData = {tweet:l[0].tweet, likes:l[1].likes, replies:l[2].replies, dateTime:l[0].date_time}
            res.send(responseData)
        }else{
            res.status(401)
            res.send("Invalid Request")
        }
    }catch{
        return res.send("Invalid tweet id")
    }
})


// API = 7 ---> If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet
app.get('/tweets/:tweetId/likes/', authentication, async (req,res) => {
    const {tweetId} = req.params
    const userDetails = req.userDetails
    const followingUserIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userDetails.user_id}`
    let followingUserIdList = null
    try{
        followingUserIdList = await db.all(followingUserIdQuery)
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error retrieving followers' });
    }
    const followingUserIds = followingUserIdList.map(follower => follower.following_user_id)
    const query = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
    try{
        const uId = await db.get(query)
        if(uId.user_id in followingUserIds){
            let queryForRes =  `SELECT u.username as name 
                                FROM like as l 
                                JOIN user as u 
                                ON l.user_id = u.user_id
                                WHERE l.tweet_id = ${tweetId}`
            let response = await db.all(queryForRes)
            const likesByUser = response.map((user) => user.name)
            res.send({likes:likesByUser})
        }else{
            res.status(401)
            res.send("Invalid Request")
        }
    }catch(err){
        console.log(err.message)
    }
})


// API = 8 ---> If the user requests a tweet of a user he is following, return the list of replies.
app.get('/tweets/:tweetId/replies/', authentication, async (req,res) => {
    const {tweetId} = req.params
    const userDetails = req.userDetails
    const followingUserIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userDetails.user_id}`
    let followingUserIdList = null
    try{
        followingUserIdList = await db.all(followingUserIdQuery)
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error retrieving followers' });
    }
    const followingUserIds = followingUserIdList.map(follower => follower.following_user_id)
    const query = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
    try{
        const uId = await db.get(query)
        if(uId.user_id in followingUserIds){
            let queryForRes =  `SELECT u.username as name , r.reply as reply
                                FROM reply as r 
                                JOIN user as u 
                                ON r.user_id = u.user_id
                                WHERE r.tweet_id = ${tweetId}`
            let response = await db.all(queryForRes)
            const repliesByUser = response.map((user) => user)
            res.send({replies:repliesByUser})
        }else{
            res.status(401)
            res.send("Invalid Request")
        }
    }catch(err){
        console.log(err.message)
    }
})


// API = 9  ---> Returns a list of all tweets of the user
app.get('/user/tweets/', authentication, async (req,res) => {
    const userDetails = req.userDetails
    const query = `SELECT tweet_id, tweet, date_time as dateTime FROM tweet WHERE user_id = ${userDetails.user_id}`
    try{
        const data = await db.all(query)
        const twIds = data.map((tw) => tw.tweet_id)
        for (let i = 0; i < twIds.length; i++) {
            const likeQuery = `SELECT count(like_id) as likes From like where tweet_id = ${twIds[i]}`
            const likesCount = await db.get(likeQuery)
            data[i].likes = likesCount.likes
            const replyQuery = `SELECT count(reply_id) as replies From reply where tweet_id = ${twIds[i]}`
            const replyCount = await db.get(replyQuery)
            data[i].replies = replyCount.replies
        }
        const responseData = data.map((d) => {
            return{
                tweet: d.tweet,
                likes: d.likes,
                replies : d.replies,
                dateTime: d.dateTime
            }
        })
        res.send(responseData)
    }catch(err){
        console.log(err.message)
    }
})


// API = 10  ---> Create a tweet in the tweet table
app.post('/user/tweets/', authentication, async (req,res) => {
    const {user_id} = req.userDetails
    const {tweet} = req.body
    const today = new Date();
    const formattedDate = format(today, 'yyyy-MM-dd HH:mm:ss');
    const query = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${user_id}, '${formattedDate}');`
    try{
        await db.run(query)
        res.send('Created a Tweet')

    }catch(err){
        console.log(err.message)
    }
})



// API = 11 ---> 
app.delete('/tweets/:tweetId/', authentication, async (req,res) => {
    const {tweetId} = req.params
    const {user_id} = req.userDetails
    let query = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId}`
    try{
        const userId = await db.get(query)
        if(userId.user_id === user_id){
            query = `DELETE FROM tweet WHERE tweet_id=${tweetId}`
            db.run(query)
            res.send('Tweet Removed')
        }else{
            res.status(401)
            res.send('Invalid Request')
        }
    }catch(err){
        console.log(err.message)
    }
})